// Lazy-loaded database connection to prevent circular dependencies
let db = null;

function getDatabase() {
  if (!db) {
    const { db: database } = require('../config/database');
    db = database;
  }
  return db;
}

const { v4: uuidv4 } = require('uuid');
const AuditService = require('../config/AuditService');

// High-precision financial normalization (Prevents JS floating point errors)
const normalizeAmount = (val) => Math.round((parseFloat(val) || 0) * 100) / 100;

class Sale {
  constructor(data) {
    this.items = data.items || [];
    this.updatedAt = data.updatedAt || data.updated_at;
  }

  // Helper to map DB row to camelCase
  static mapRow(sale) {
    if (!sale) return null;
    const createdAt = sale.created_at;
    const createdAtISO = (createdAt && typeof createdAt !== 'string')
      ? createdAt.toISOString()
      : (createdAt || null);
    const dateStr = sale.date || (createdAtISO ? createdAtISO.split('T')[0] : new Date().toISOString().split('T')[0]);
    
    return {
      id: sale.id,
      paymentMethod: sale.payment_method,
      customerName: sale.customer_name,
      customerPhone: sale.customer_phone,
      total: typeof sale.total === 'string' ? parseFloat(sale.total) : sale.total,
      totalCogs: typeof sale.total_cogs === 'string' ? parseFloat(sale.total_cogs) : (sale.total_cogs || 0),
      status: sale.status,
      mpesaCode: sale.mpesa_code,
      notes: sale.notes,
      date: dateStr,
      createdBy: sale.created_by,
      createdAt: createdAtISO,
      updatedAt: sale.updated_at,
      businessId: sale.business_id,
      metadata: sale.metadata,
      items: sale.items || []
    };
  }

  // Create new sale
  static async create(saleData) {
    if (!saleData.businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    // Support legacy single-item requests by wrapping in items array
    if (!saleData.items && saleData.productId) {
      saleData.items = [{
        productId: saleData.productId,
        productName: saleData.productName,
        quantity: saleData.quantity,
        unitPrice: saleData.unitPrice || saleData.unit_price,
        total: saleData.total
      }];
    }

    if (!saleData.items || saleData.items.length === 0) {
      throw new Error('At least one item is required for a sale');
    }

    const saleId = saleData.id || uuidv4();
    const trx = await dbx.transaction();
    
    try {
      // RLS Handshake for transaction isolation
      await trx.raw("SELECT set_config('app.current_business_id', ?, true)", [saleData.businessId]);
      let totalRevenue = 0;
      let totalCogs = 0;
      const saleItemsToInsert = [];

      // Loop through items for validation and preparation
      for (const item of saleData.items) {
        const qty = parseFloat(item.quantity);
        const price = parseFloat(item.unitPrice || item.unit_price);

        if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${item.productName || 'product'}`);
        if (price < 0) throw new Error(`Invalid price for ${item.productName || 'product'}`);

        const product = await trx('products')
          .where('id', item.productId)
          .andWhere('business_id', saleData.businessId)
          .first();

        if (!product) throw new Error(`Product not found: ${item.productName || item.productId}`);
        if (product.stock_quantity < Number(item.quantity)) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        const cost = parseFloat(product.unit_cost || product.cost_price || 0);
        const lineTotal = normalizeAmount(price * qty);
        
        totalRevenue = normalizeAmount(totalRevenue + lineTotal);
        totalCogs = normalizeAmount(totalCogs + (cost * qty));

        saleItemsToInsert.push({
          id: uuidv4(),
          sale_id: saleId,
          product_id: item.productId,
          product_name: product.name,
          quantity: qty,
          unit_price: price,
          unit_cost: cost,
          total: lineTotal
        });

        // Decrement stock
        await trx('products')
          .where('id', item.productId)
          .decrement('stock_quantity', qty)
          .update('updated_at', new Date().toISOString());
      }

      // 1. Create sale record (Parent)
      const [newSale] = await trx('sales')
        .insert({
          id: saleId,
          business_id: saleData.businessId,
          total: totalRevenue,
          total_cogs: totalCogs,
          payment_method: (saleData.paymentMethod || 'cash').toLowerCase(),
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone,
          status: saleData.status || 'completed',
          mpesa_code: saleData.mpesaCode,
          notes: saleData.notes,
          date: saleData.date || new Date().toISOString().split('T')[0],
          created_by: saleData.createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .returning('*');

      // 2. Insert items (Children)
      await trx('sale_items').insert(saleItemsToInsert);

      // 3. Handle Debt
      if ((saleData.paymentMethod || saleData.payment_method || '').toLowerCase() === 'debt') {
        const notes = saleItemsToInsert.length === 1 
          ? `Sale: ${saleItemsToInsert[0].product_name}` 
          : `Batch Sale: ${saleItemsToInsert.length} items`;

        await trx('debts').insert({
          id: uuidv4(),
          business_id: saleData.businessId,
          sale_id: saleId,
          customer_name: saleData.customerName,
          customer_phone: saleData.customerPhone,
          amount: totalRevenue,
          amount_paid: 0,
          balance: totalRevenue,
          status: 'pending',
          notes: notes,
          created_by: saleData.createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      await trx.commit();
      
      // 4. Audit Log (Traceability)
      AuditService.log({
        businessId: saleData.businessId,
        userEmail: saleData.createdByEmail || saleData.createdBy,
        action: 'CREATE',
        entityType: 'SALE',
        entityId: saleId,
        newData: { total: totalRevenue, items: saleItemsToInsert.length }
      });

      // Return with hydrated items
      newSale.items = saleItemsToInsert;
      return Sale.mapRow(newSale);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // Get all sales with basic filters
  static async findAll(filters = {}, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    let query = dbx('sales as s')
      .where('s.business_id', businessId)
      .leftJoin('sale_items as si', 's.id', 'si.sale_id')
      .select([
        's.*',
        dbx.raw("COALESCE(json_agg(si.*) FILTER (WHERE si.id IS NOT NULL), '[]') as items")
      ])
      .groupBy('s.id');

    if (filters.date_from) {
      query = query.where('s.created_at', '>=', filters.date_from);
    }
    
    if (filters.date_to) {
      const to = filters.date_to.length === 10 ? filters.date_to + 'T23:59:59.999Z' : filters.date_to;
      query = query.where('s.created_at', '<=', to);
    }
    
    if (filters.payment_method) {
      query = query.where('s.payment_method', filters.payment_method);
    }
    
    if (filters.customer_name) {
      query = query.where('s.customer_name', 'ilike', `%${filters.customer_name}%`);
    }
    
    const sales = await query.orderBy('s.created_at', 'desc');
    return sales.map(Sale.mapRow);
  }

  // New: Server-side pagination with filters and sorting
  static async findPaginated({
    date_from,
    date_to,
    payment_method,
    status,
    customer_name
  } = {}, {
    page = 1,
    perPage = 25,
    sortBy = 'created_at',
    sortDir = 'desc'
  } = {}, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();

    // Base query with filters and item aggregation
    let base = dbx('sales as s')
      .where('s.business_id', businessId)
      .leftJoin('sale_items as si', 's.id', 'si.sale_id')
      .groupBy('s.id');

    if (date_from) base = base.where('s.created_at', '>=', date_from);
    if (date_to) {
      const to = date_to.length === 10 ? date_to + 'T23:59:59.999Z' : date_to;
      base = base.where('s.created_at', '<=', to);
    }
    if (payment_method) base = base.where('s.payment_method', payment_method);
    if (status) base = base.where('s.status', status);
    if (customer_name) base = base.where('s.customer_name', 'ilike', `%${customer_name}%`);

    // Total count
    const [{ total_count }] = await dbx('sales')
      .where('business_id', businessId)
      .modify(query => {
         if (date_from) query.where('created_at', '>=', date_from);
         if (date_to) query.where('created_at', '<=', (date_to.length === 10 ? date_to + 'T23:59:59.999Z' : date_to));
         if (payment_method) query.where('payment_method', payment_method);
         if (status) query.where('status', status);
         if (customer_name) query.where('customer_name', 'ilike', `%${customer_name}%`);
      })
      .count('* as total_count');
    
    const total = parseInt(total_count) || 0;

    // Fetch page items with aggregation
    const rows = await base
      .clone()
      .select([
        's.*',
        dbx.raw("COALESCE(json_agg(si.*) FILTER (WHERE si.id IS NOT NULL), '[]') as items")
      ])
      .orderBy(`s.${sortBy}`, sortDir.toLowerCase() === 'asc' ? 'asc' : 'desc')
      .limit(Math.min(Math.max(parseInt(perPage) || 25, 1), 1000))
      .offset((Math.max(parseInt(page) || 1, 1) - 1) * Math.min(Math.max(parseInt(perPage) || 25, 1), 1000));

    return {
      items: rows.map(Sale.mapRow),
      total,
      page: Math.max(parseInt(page) || 1, 1),
      perPage: Math.min(Math.max(parseInt(perPage) || 25, 1), 1000),
      totalPages: Math.max(Math.ceil(total / Math.min(Math.max(parseInt(perPage) || 25, 1), 1000)), 1)
    };
  }

  // Get sale by ID
  static async findById(id, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    const sale = await dbx('sales as s')
      .where('s.id', id)
      .andWhere('s.business_id', businessId)
      .leftJoin('sale_items as si', 's.id', 'si.sale_id')
      .select([
        's.*',
        dbx.raw("COALESCE(json_agg(si.*) FILTER (WHERE si.id IS NOT NULL), '[]') as items")
      ])
      .groupBy('s.id')
      .first();
      
    return Sale.mapRow(sale);
  }

  // Update sale (transactional with stock and debt consistency)
  static async update(id, updateData, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    const trx = await dbx.transaction();

    try {
      await trx.raw("SELECT set_config('app.current_business_id', ?, true)", [businessId]);

      // Load existing sale (Parent)
      const existing = await trx('sales').where('id', id).andWhere('business_id', businessId).forUpdate().first();
      if (!existing) throw new Error('Sale not found');

      let newTotal = existing.total;
      let newTotalCogs = existing.total_cogs;

      // Handle Items change
      if (updateData.items && Array.isArray(updateData.items)) {
        // 1. Fetch old items
        const oldItems = await trx('sale_items').where('sale_id', id).forUpdate();

        // 2. Restore old stock
        for (const old of oldItems) {
          await trx('products')
            .where('id', old.product_id)
            .andWhere('business_id', businessId)
            .increment('stock_quantity', old.quantity)
            .update('updated_at', new Date().toISOString());
        }

        // 3. Delete old items
        await trx('sale_items').where('sale_id', id).del();

        // 4. Validate and deduct new stock
        let totalRevenue = 0;
        let totalCogs = 0;
        const itemsToInsert = [];

        for (const item of updateData.items) {
          const qty = parseFloat(item.quantity);
          const price = parseFloat(item.unitPrice || item.unit_price);
          
          if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${item.productName || 'product'}`);
          if (price < 0) throw new Error(`Invalid price for ${item.productName || 'product'}`);

          const product = await trx('products')
            .where('id', item.productId || item.product_id)
            .andWhere('business_id', businessId)
            .forUpdate()
            .first();

          if (!product) throw new Error(`Product not found: ${item.productName || item.productId}`);
          if (product.stock_quantity < qty) throw new Error(`Insufficient stock for ${product.name}`);

          const cost = parseFloat(product.unit_cost || product.cost_price || 0);
          const lineTotal = normalizeAmount(price * qty);

          totalRevenue = normalizeAmount(totalRevenue + lineTotal);
          totalCogs = normalizeAmount(totalCogs + (cost * qty));

          itemsToInsert.push({
            id: uuidv4(),
            sale_id: id,
            product_id: product.id,
            product_name: product.name,
            quantity: qty,
            unit_price: price,
            unit_cost: cost,
            total: lineTotal
          });

          // Deduct stock
          await trx('products')
            .where('id', product.id)
            .andWhere('business_id', businessId)
            .decrement('stock_quantity', qty)
            .update('updated_at', new Date().toISOString());
        }

        // 5. Insert new items
        await trx('sale_items').insert(itemsToInsert);

        newTotal = totalRevenue;
        newTotalCogs = totalCogs;
      }

      // Update basic fields
      const dbData = {
        total: newTotal,
        total_cogs: newTotalCogs,
        payment_method: updateData.paymentMethod ?? updateData.payment_method ?? existing.payment_method,
        customer_name: updateData.customerName ?? updateData.customer_name ?? existing.customer_name,
        customer_phone: updateData.customerPhone ?? updateData.customer_phone ?? existing.customer_phone,
        status: updateData.status ?? existing.status,
        mpesa_code: updateData.mpesaCode ?? updateData.mpesa_code ?? existing.mpesa_code,
        notes: updateData.notes ?? existing.notes,
        updated_at: new Date().toISOString()
      };

      const [updatedSale] = await trx('sales')
        .where('id', id)
        .andWhere('business_id', businessId)
        .update(dbData)
        .returning('*');

      // Keep linked debt consistent
      const hadDebt = await trx('debts').where('sale_id', id).andWhere('business_id', businessId).forUpdate().first();
      const isDebtNow = (dbData.payment_method === 'debt');

      if (hadDebt && !isDebtNow) {
        await trx('debts').where('sale_id', id).andWhere('business_id', businessId).del();
      } else if (!hadDebt && isDebtNow) {
        await trx('debts').insert({
          id: uuidv4(),
          business_id: businessId,
          sale_id: id,
          customer_name: dbData.customer_name,
          customer_phone: dbData.customer_phone,
          amount: dbData.total,
          balance: dbData.total,
          amount_paid: 0,
          status: 'pending',
          notes: `Sale Update: ${dbData.total}`,
          created_by: updatedSale.created_by || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else if (hadDebt && isDebtNow) {
        // If amount changed, we need to adjust balance. Let's just blindly sync amount and balance for simplicity if no payments were made
        const amountDiff = dbData.total - hadDebt.amount;
        await trx('debts')
          .where('sale_id', id)
          .andWhere('business_id', businessId)
          .update({
            customer_name: dbData.customer_name,
            customer_phone: dbData.customer_phone,
            amount: dbData.total,
            balance: trx.raw('balance + ?', [amountDiff]), // Adjust balance by the diff
            updated_at: new Date().toISOString()
          });
      }

      await trx.commit();
      
      AuditService.log({
        businessId: businessId,
        userEmail: updateData.updatedBy || 'System',
        action: 'UPDATE',
        entityType: 'SALE',
        entityId: id,
        newData: { total: newTotal }
      });

      return Sale.mapRow(updatedSale);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // Delete sale - ENHANCED VERSION with better safeguards and logging
  static async delete(id, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    const trx = await dbx.transaction();

    try {
      // 1) Lock the sale row first to serialize concurrent deletes
      const sale = await trx('sales')
        .where('id', id)
        .andWhere('business_id', businessId)
        .forUpdate()
        .first();

      if (!sale) {
        // Already deleted (or never existed) → nothing to restore
        await trx.rollback();
        throw new Error('Sale not found');
      }

      // Log the sale being deleted for debugging
      console.log(`🗑️ Deleting sale ${id}: Product ${sale.product_id}, Quantity ${sale.quantity}, Payment: ${sale.payment_method}`);

      // 2) Delete the sale FIRST and return the deleted row to enforce idempotency
      const [deletedSale] = await trx('sales')
        .where('id', id)
        .andWhere('business_id', businessId)
        .del()
        .returning('*');

      if (!deletedSale) {
        await trx.rollback();
        console.warn(`⚠️ No sale rows were deleted for id ${id} - possible race condition`);
        throw new Error('Sale deletion failed - no rows affected');
      }

      // 3) Lock the product row and get current state
      const productRow = await trx('products')
        .where('id', deletedSale.product_id)
        .andWhere('business_id', businessId)
        .forUpdate()
        .first();

      if (productRow) {
        const currentStock = Number(productRow.stock_quantity);

        // Log current state before restoration
        console.log(`📦 Product ${deletedSale.product_id} (${productRow.name}) current stock: ${currentStock}, restoring ${deletedSale.quantity} units`);

        // Add validation to prevent negative/invalid scenarios
        if (Number(deletedSale.quantity) <= 0) {
          console.warn(`⚠️ Invalid sale quantity (${deletedSale.quantity}) for sale ${id} - skipping stock restoration`);
        } else {
          // Restore the stock that was deducted for this sale
          await trx('products')
            .where('id', deletedSale.product_id)
            .andWhere('business_id', businessId)
            .increment('stock_quantity', Number(deletedSale.quantity))
            .update('updated_at', new Date().toISOString());

          const newStock = currentStock + Number(deletedSale.quantity);
          console.log(`✅ Stock restored: Product ${deletedSale.product_id} now has ${newStock} units (was ${currentStock}, added ${deletedSale.quantity})`);
        }
      } else {
        console.warn(`⚠️ Product ${deletedSale.product_id} not found - cannot restore stock for deleted sale ${id}`);
      }

      // 4) Remove any associated debts for this sale
      const deletedDebts = await trx('debts').where('sale_id', id).andWhere('business_id', businessId).del();
      if (deletedDebts > 0) {
        console.log(`💳 Deleted ${deletedDebts} debt record(s) associated with sale ${id}`);
      }

      // 5) Read back product for response (may be null if product missing)
      const updatedProduct = productRow
        ? await trx('products').where('id', deletedSale.product_id).andWhere('business_id', businessId).first()
        : null;

      await trx.commit();

      // 6) Audit Log (Traceability)
      AuditService.log({
        businessId: businessId,
        userEmail: 'system-auth', // Can be hydrated from request context in production
        action: 'DELETE',
        entityType: 'SALE',
        entityId: id,
        oldData: { total: deletedSale.total, productId: deletedSale.product_id }
      });

      console.log(`🎉 Successfully deleted sale ${id} and restored stock`);
      return {
        product: updatedProduct,
        deletedSale: {
          id: deletedSale.id,
          productId: deletedSale.product_id,
          quantity: deletedSale.quantity,
          total: deletedSale.total
        }
      };

    } catch (error) {
      await trx.rollback();
      console.error(`❌ Failed to delete sale ${id}:`, error.message);
      throw error;
    }
  }

  // Additional helper method to check for potential stock inconsistencies
  static async validateStockConsistency(productId, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    try {
      // Get product current stock
      const product = await dbx('products').where('id', productId).andWhere('business_id', businessId).first();
      if (!product) {
        return { valid: false, error: 'Product not found' };
      }
      
      // Calculate total quantity sold for this product
      const salesResult = await dbx('sales')
        .where('product_id', productId)
        .andWhere('business_id', businessId)
        .sum('quantity as total_sold');
      
      const totalSold = parseInt(salesResult[0]?.total_sold || 0);
      
      // Get total sales count
      const salesCount = await dbx('sales')
        .where('product_id', productId)
        .count('* as count');
      
      const totalSalesCount = parseInt(salesCount[0]?.count || 0);
      
      return {
        valid: true,
        productId,
        productName: product.name,
        currentStock: product.stock_quantity,
        totalSold,
        totalSalesCount,
        lastUpdated: product.updated_at
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  // Method to detect and fix potential stock inconsistencies (use with caution)
  static async detectStockInconsistencies(businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    try {
      // Get all products with their sales totals
      const results = await dbx('products as p')
        .leftJoin('sales as s', function() {
          this.on('p.id', '=', 's.product_id').andOn('p.business_id', '=', 's.business_id')
        })
        .where('p.business_id', businessId)
        .select(
          'p.id',
          'p.name',
          'p.stock_quantity',
          'p.updated_at'
        )
        .sum('s.quantity as total_sold')
        .count('s.id as sales_count')
        .groupBy('p.id', 'p.name', 'p.stock_quantity', 'p.updated_at')
        .orderBy('p.name');
      
      const inconsistencies = [];
      
      for (const row of results) {
        const totalSold = parseInt(row.total_sold || 0);
        const salesCount = parseInt(row.sales_count || 0);
        
        // Flag products that might have inconsistencies
        if (totalSold > 0 && row.stock_quantity < 0) {
          inconsistencies.push({
            productId: row.id,
            productName: row.name,
            currentStock: row.stock_quantity,
            totalSold,
            salesCount,
            issue: 'Negative stock with sales history'
          });
        }
      }
      
      return {
        totalProducts: results.length,
        inconsistencies,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error detecting stock inconsistencies:', error);
      throw error;
    }
  }

  // Get daily sales aggregates for the last N days (inclusive)
  static async getDailySales(days = 7, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    const n = Math.max(parseInt(days) || 7, 1);
    const since = new Date(Date.now() - (n - 1) * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const rows = await dbx('sales')
      .where('business_id', businessId)
      .andWhere('date', '>=', since)
      .select('date')
      .sum({ total_revenue: 'total' })
      .count({ total_sales: '*' })
      .groupBy('date')
      .orderBy('date', 'asc');

    // Normalize numeric types
    return rows.map(r => ({
      date: r.date,
      total_sales: parseInt(r.total_sales) || 0,
      total_revenue: parseFloat(r.total_revenue) || 0
    }));
  }

  // Get weekly sales for the current week (Monday–Sunday), zero-filled
  static async getWeeklySales(businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();

    // Compute Monday of current week based on local time
    const today = new Date();
    const day = today.getDay(); // 0=Sun,1=Mon,...
    // Calculate offset to Monday (1). If Sunday (0), we go back 6 days
    const diffToMonday = (day === 0) ? -6 : (1 - day);
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    // Build array of dates Mon..Sun in YYYY-MM-DD
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().split('T')[0];
    });

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Query aggregated sums within the week range by sales.date
    const rows = await dbx('sales')
      .where('business_id', businessId)
      .andWhere('date', '>=', days[0])
      .andWhere('date', '<=', days[6])
      .select('date')
      .sum({ total_revenue: 'total' })
      .count({ total_sales: '*' })
      .groupBy('date');

    const byDate = new Map();
    for (const r of rows) {
      byDate.set(r.date, {
        total_sales: parseInt(r.total_sales) || 0,
        total_revenue: parseFloat(r.total_revenue) || 0
      });
    }

    // Zero-fill and order Mon..Sun
    const result = days.map(d => ({
      date: d,
      total_sales: byDate.get(d)?.total_sales || 0,
      total_revenue: byDate.get(d)?.total_revenue || 0
    }));

    return {
      week: {
        start: days[0],
        end: days[6]
      },
      days: result
    };
  }

  // Get top products by quantity sold
  static async getTopProducts(limit = 10, businessId, filters = {}) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    const lim = Math.max(Math.min(parseInt(limit) || 10, 100), 1);

    let query = dbx('sale_items as si')
      .join('sales as s', 'si.sale_id', 's.id')
      .where('s.business_id', businessId);

    if (filters.date_from) query = query.where('s.created_at', '>=', filters.date_from);
    if (filters.date_to) query = query.where('s.created_at', '<=', filters.date_to);

    const rows = await query
      .select('si.product_id', 'si.product_name')
      .sum({ quantity_sold: 'si.quantity' })
      .sum({ revenue: 'si.total' })
      .groupBy('si.product_id', 'si.product_name')
      .orderBy([{ column: 'quantity_sold', order: 'desc' }, { column: 'revenue', order: 'desc' }])
      .limit(lim);

    return rows.map(r => ({
      productId: r.product_id,
      productName: r.product_name,
      quantity_sold: parseInt(r.quantity_sold) || 0,
      revenue: parseFloat(r.revenue) || 0
    }));
  }

  // Get basic sales summary for dashboard
  static async getSummary(filters = {}, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    // Aggregates computed from parent sales records
    let query = dbx('sales').where('business_id', businessId);
    if (filters.date_from) query = query.where('created_at', '>=', filters.date_from);
    if (filters.date_to)   query = query.where('created_at', '<=', filters.date_to);
    
    const summary = await query
      .select(
        dbx.raw('COUNT(*) as total_sales'),
        dbx.raw('SUM(total) as total_revenue'),
        dbx.raw('SUM(total_cogs) as total_cogs'), // Now stored as pre-calculated aggregate in parent
        dbx.raw('SUM(CASE WHEN payment_method = ? THEN total ELSE 0 END) as cash_sales', ['cash']),
        dbx.raw('SUM(CASE WHEN payment_method = ? THEN total ELSE 0 END) as mpesa_sales', ['mpesa']),
        dbx.raw('SUM(CASE WHEN payment_method = ? THEN total ELSE 0 END) as debt_sales', ['debt'])
      )
      .first();
    
    return {
      total_sales: parseInt(summary.total_sales) || 0,
      total_revenue: parseFloat(summary.total_revenue) || 0,
      total_cogs: parseFloat(summary.total_cogs) || 0,
      cash_sales: parseFloat(summary.cash_sales) || 0,
      mpesa_sales: parseFloat(summary.mpesa_sales) || 0,
      debt_sales: parseFloat(summary.debt_sales) || 0
    };
  }

  // Get daily sales breakdown for last N days — used for dashboard chart
  static async getDailySales(days = 7, businessId) {
    if (!businessId) throw new Error('businessId is required for logical data isolation');
    const dbx = getDatabase();
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const rows = await dbx('sales')
      .where('business_id', businessId)
      .andWhere('created_at', '>=', since.toISOString())
      .select(
        dbx.raw(`DATE(created_at) as date`),
        dbx.raw('COUNT(*) as total_sales'),
        dbx.raw('SUM(total) as total_revenue'),
        dbx.raw(`SUM(CASE WHEN payment_method = 'cash'  THEN total ELSE 0 END) as cash`),
        dbx.raw(`SUM(CASE WHEN payment_method = 'mpesa' THEN total ELSE 0 END) as mpesa`),
        dbx.raw(`SUM(CASE WHEN payment_method = 'debt'  THEN total ELSE 0 END) as debt`)
      )
      .groupByRaw('DATE(created_at)')
      .orderBy('date', 'asc');

    // Fill in missing days with zeroes so the chart always shows all 7 days
    const result = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const row = rows.find(r => {
        const rd = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0];
        return rd === dateStr;
      });
      result.push({
        date: dateStr,
        total_sales: row ? parseInt(row.total_sales) || 0 : 0,
        total_revenue: row ? parseFloat(row.total_revenue) || 0 : 0,
        cash:  row ? parseFloat(row.cash)  || 0 : 0,
        mpesa: row ? parseFloat(row.mpesa) || 0 : 0,
        debt:  row ? parseFloat(row.debt)  || 0 : 0
      });
    }
    return result;
  }

  // Get daily sales for a specific arbitrary date range
  static async getTrend(dateFrom, dateTo, businessId) {
    if (!businessId) throw new Error('businessId is required');
    const dbx = getDatabase();
    
    const start = new Date(dateFrom);
    const end = new Date(dateTo);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const rows = await dbx('sales')
      .where('business_id', businessId)
      .andWhere('created_at', '>=', start.toISOString())
      .andWhere('created_at', '<=', end.toISOString())
      .select(
        dbx.raw(`DATE(created_at) as date`),
        dbx.raw('SUM(total) as total_revenue')
      )
      .groupByRaw('DATE(created_at)')
      .orderBy('date', 'asc');

    // Compute diff in days to fill zeros
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Safety clamp (max 366 days for performance)
    const renderDays = Math.min(diffDays || 1, 366);

    const result = [];
    for (let i = 0; i < renderDays; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().split('T')[0];
        
        const row = rows.find(r => {
            const rd = typeof r.date === 'string' ? r.date : new Date(r.date).toISOString().split('T')[0];
            return rd === dateStr;
        });

        result.push({
            date: dateStr,
            total_revenue: row ? parseFloat(row.total_revenue) || 0 : 0
        });
    }

    return result;
  }

  // Relational validation supporting both legacy and multi-item structures
  static validate(data) {
    const errors = [];
    
    // items must exist and be a non-empty array
    const items = data.items || [];
    if (items.length === 0 && !data.productId && !data.product_id) {
       errors.push('At least one product is required for a sale');
       return errors;
    }

    // Validate either the single legacy item or the items array
    const itemsToValidate = items.length > 0 ? items : [data];

    itemsToValidate.forEach((item, index) => {
      const label = items.length > 1 ? `Item ${index + 1}: ` : '';
      
      if (!item.productId && !item.product_id && !item.id) {
        errors.push(`${label}Product ID is required`);
      }
      
      if (!item.quantity || isNaN(parseFloat(item.quantity)) || parseFloat(item.quantity) <= 0) {
        errors.push(`${label}Valid quantity is required`);
      }
      
      if (!item.unitPrice && !item.unit_price && !item.price) {
        // unit price is required unless we fetch from DB (which we do in create), 
        // but for validation consistency we expect it from frontend
        errors.push(`${label}Unit price is required`);
      }
    });
    
    const paymentMethod = data.paymentMethod || data.payment_method;
    if (!paymentMethod || !['cash', 'mpesa', 'debt'].includes(paymentMethod)) {
      errors.push('Valid payment method is required (cash, mpesa, or debt)');
    }
    
    if (paymentMethod === 'debt') {
      const name = data.customerName || data.customer_name;
      const phone = data.customerPhone || data.customer_phone;
      if (!name || name.trim().length === 0) {
        errors.push('Customer name is required for debt payments');
      }
      if (!phone || phone.trim().length === 0) {
        errors.push('Customer phone is required for debt payments');
      }
    }
    
    return errors;
  }

  // Partial validation for updates: only validate fields provided
  static validateUpdate(data) {
    const errors = [];

    if (data.hasOwnProperty('productId') || data.hasOwnProperty('product_id')) {
      const pid = data.productId ?? data.product_id;
      if (!pid) errors.push('Product ID cannot be empty');
    }

    if (data.hasOwnProperty('quantity')) {
      if ((!data.quantity) || isNaN(parseInt(data.quantity)) || parseInt(data.quantity) <= 0) {
        errors.push('Valid quantity is required');
      }
    }

    if (data.hasOwnProperty('unitPrice') || data.hasOwnProperty('unit_price')) {
      const up = parseFloat(data.unitPrice ?? data.unit_price);
      if (isNaN(up) || up <= 0) {
        errors.push('Valid unit price is required');
      }
    }

    if (data.hasOwnProperty('paymentMethod') || data.hasOwnProperty('payment_method')) {
      const pm = data.paymentMethod ?? data.payment_method;
      if (!['cash', 'mpesa', 'debt'].includes(pm)) {
        errors.push('Valid payment method is required (cash, mpesa, or debt)');
      }
      if (pm === 'debt') {
        const name = data.customerName ?? data.customer_name;
        const phone = data.customerPhone ?? data.customer_phone;
        if (!name || (name || '').trim().length === 0) errors.push('Customer name is required for debt payments');
        if (!phone || (phone || '').trim().length === 0) errors.push('Customer phone is required for debt payments');
      }
    }

    return errors;
  }
}

module.exports = Sale;
