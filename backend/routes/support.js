const express = require('express');
const router = express.Router();
const { db } = require('../config/database');
const { catchAsync } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');

/**
 * GET /api/support/tickets
 * Get all tickets for the current business
 */
router.get('/tickets', catchAsync(async (req, res) => {
  const tickets = await db('support_tickets')
    .where({ business_id: req.businessId })
    .orderBy('updated_at', 'desc');
  
  res.json({ success: true, data: tickets });
}));

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
router.post('/tickets', catchAsync(async (req, res) => {
  const { subject, message } = req.body;
  
  if (!subject || !message) {
    return res.status(400).json({ success: false, message: 'Subject and message are required' });
  }

  const result = await db.transaction(async (trx) => {
    const ticketId = uuidv4();
    const [ticket] = await trx('support_tickets')
      .insert({
        id: ticketId,
        business_id: req.businessId,
        subject,
        description: message,
        status: 'open',
        priority: 'medium',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .returning('*');

    const [msg] = await trx('support_messages').insert({
      id: uuidv4(),
      ticket_id: ticketId,
      sender_id: req.user.uid,
      sender_role: 'merchant',
      content: message,
      created_at: new Date().toISOString()
    }).returning('*');

    return { ticket, message: msg };
  });

  // Notify admin
  if (req.app.locals.adminNamespace) {
    req.app.locals.adminNamespace.emit('adminAlert', {
      type: 'newTicket',
      data: {
        message: `New support ticket: ${subject}`,
        ticketId: result.ticket.id
      }
    });
    // Trigger a data refresh for support queue
    req.app.locals.adminNamespace.emit('data-refresh');
  }

  res.status(201).json({ success: true, data: result.ticket });
}));

/**
 * GET /api/support/tickets/:id
 * Get ticket history
 */
router.get('/tickets/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  
  const ticket = await db('support_tickets')
    .where({ id, business_id: req.businessId })
    .first();
  
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  const messages = await db('support_messages')
    .where({ ticket_id: id })
    .orderBy('created_at', 'asc');

  res.json({ success: true, data: { ticket, messages } });
}));

/**
 * POST /api/support/tickets/:id/messages
 * Reply to a ticket
 */
router.post('/tickets/:id/messages', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  const ticket = await db('support_tickets')
    .where({ id, business_id: req.businessId })
    .first();
  
  if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

  const result = await db.transaction(async (trx) => {
    const [message] = await trx('support_messages')
      .insert({
        id: uuidv4(),
        ticket_id: id,
        sender_id: req.user.uid,
        sender_role: 'merchant',
        content,
        created_at: new Date().toISOString()
      })
      .returning('*');

    // Mark ticket as open if it was resolved/closed
    await trx('support_tickets')
      .where({ id })
      .update({ status: 'open', updated_at: new Date().toISOString() });
      
    return message;
  });

  // Notify admin
  if (req.app.locals.adminNamespace) {
    req.app.locals.adminNamespace.emit('adminAlert', {
      type: 'newTicketReply',
      data: {
        message: `New reply on ticket: ${ticket.subject}`,
        ticketId: id
      }
    });
    req.app.locals.adminNamespace.emit('data-refresh');
  }

  res.status(201).json({ success: true, data: result });
}));

module.exports = router;
