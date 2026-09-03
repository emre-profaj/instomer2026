import express from 'express';
import { authenticateJWT, requireWorkspaceAccess } from '../middleware/auth.js';
import { getSegmentList, getSegmentGroups, getSegmentCount, buildSegmentWhere, evaluateContactSegment } from '../services/smartSegment.service.js';
import prisma from '../lib/prisma.js';

const router = express.Router();
router.use(authenticateJWT);

// GET /:workspaceId/segments/definitions
router.get('/:workspaceId/segments/definitions', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params; // eslint-disable-line no-unused-vars
    const segments = getSegmentList();
    const groups = getSegmentGroups();
    res.json({ segments, groups });
  } catch (error) {
    console.error('📊 [SmartSegment] Error fetching definitions:', error.message);
    res.status(500).json({ error: 'Failed to fetch segment definitions' });
  }
});

// GET /:workspaceId/segments/counts
router.get('/:workspaceId/segments/counts', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const segments = getSegmentList();
    
    const countsArray = await Promise.all(
      segments.map(async (segment) => {
        const count = await getSegmentCount(segment.id, workspaceId);
        return { id: segment.id, count };
      })
    );
    
    const counts = {};
    countsArray.forEach(c => {
      counts[c.id] = c.count;
    });

    res.json({ counts });
  } catch (error) {
    console.error('📊 [SmartSegment] Error fetching counts:', error.message);
    res.status(500).json({ error: 'Failed to fetch segment counts' });
  }
});

// GET /:workspaceId/segments/:segmentId/count
router.get('/:workspaceId/segments/:segmentId/count', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId, segmentId } = req.params;
    const count = await getSegmentCount(segmentId, workspaceId);
    res.json({ segmentId, count });
  } catch (error) {
    console.error(`📊 [SmartSegment] Error fetching count for ${req.params.segmentId}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch segment count' });
  }
});

// GET /:workspaceId/segments/:segmentId/contacts
router.get('/:workspaceId/segments/:segmentId/contacts', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId, segmentId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const { search, tag } = req.query;

    const segmentResult = await buildSegmentWhere(segmentId, workspaceId);
    
    const where = {
      workspaceId,
      isDeleted: false,
      isBlocked: false,
    };

    // Merge segment filter
    if (segmentResult.contactIds) {
      where.id = { in: segmentResult.contactIds };
    } else if (segmentResult.where) {
      Object.assign(where, segmentResult.where);
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (tag) {
      where.tags = { contains: tag }; // tags is String, use contains
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          fullName: true,
          phone: true,
          email: true,
          status: true,
          source: true,
          tags: true,
          category: true,
          leadScore: true,
          leadTemperature: true,
          createdAt: true,
          lastContactedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.contact.count({ where })
    ]);

    const formattedContacts = contacts.map(c => {
      let parsedTags = [];
      if (c.tags) {
        try {
          parsedTags = JSON.parse(c.tags);
          if (!Array.isArray(parsedTags)) {
            parsedTags = [parsedTags];
          }
        } catch (e) {
          parsedTags = [];
        }
      }
      return { ...c, tags: parsedTags };
    });

    res.json({
      contacts: formattedContacts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error(`📊 [SmartSegment] Error fetching contacts for ${req.params.segmentId}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch segment contacts' });
  }
});

// GET /:workspaceId/segments/contact/:contactId — Kişinin dahil olduğu segmentler
router.get('/:workspaceId/segments/contact/:contactId', requireWorkspaceAccess, async (req, res) => {
  try {
    const { workspaceId, contactId } = req.params;
    const segments = getSegmentList();
    
    const results = await Promise.all(
      segments.map(async (segment) => {
        try {
          const matches = await evaluateContactSegment(contactId, segment.id, workspaceId);
          return matches ? { id: segment.id, label: segment.label, icon: segment.icon } : null;
        } catch { return null; }
      })
    );
    
    res.json({ segments: results.filter(Boolean) });
  } catch (error) {
    console.error('📊 [SmartSegment] Error matching contact segments:', error.message);
    res.status(500).json({ error: 'Failed to match contact segments' });
  }
});

export default router;
