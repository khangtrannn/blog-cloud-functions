import { Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { PARA_DOMAINS, ROOT_CONTAINER_ID, SECOND_BRAIN_COLLECTION } from "./constants";
const express = require('express');
const router = express.Router();

const db = getFirestore();

export const buildTree = (parentId: string | null, entries: any[]): any[] => {
    return entries
        .filter(entry => entry.parentContainer === parentId)
        .map(entry => ({
            id: entry.id,
            title: entry.title,
            isContainer: entry.isContainer,
            parentContainer: parentId,
            domain: entry.domain,
            entries: entry.isContainer ? buildTree(entry.id, entries) : [],
        }));
};

router.get('/', async (_: Request, res: Response) => {
    try {
            const db = getFirestore();
    
            // Fetch all entries from both collections
            const postSnapshot = await db.collection('post-v3')
                .select('title', 'parentContainer', 'isContainer', 'domain')
                .get();
    
            const secondBrainSnapshot = await db.collection('second-brain')
                .select('title', 'parentContainer', 'isContainer', 'domain')
                .get();
    
            const postEntries = postSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            const brainEntries = secondBrainSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            const allEntries = [...brainEntries, ...postEntries];
        
            const data = PARA_DOMAINS.map(domain => ({
                container: domain,
                title: domain === 'Project' ? 'Projects' :
                    domain === 'Area' ? 'Areas' :
                        domain === 'Resource' ? 'Resources' :
                            domain === 'Archive' ? 'Archives' : 'Inbox',
                domain,
                id: ROOT_CONTAINER_ID,
                isContainer: true,
                entries: allEntries
                    .filter(entry => entry.domain === domain && entry.parentContainer === ROOT_CONTAINER_ID)
                    .map(container => ({
                        id: container.id,
                        title: container.title,
                        isContainer: container.isContainer,
                        domain: container.domain,
                        parentContainer: container.parentContainer,
                        entries: container.isContainer ? buildTree(container.id, allEntries) : [],
                    })),
            }));
    
            res.json(data);
    
        } catch (error) {
            logger.error("Error building PARA structure", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, parentContainer, domain } = req.body;
        const createdAt = new Date();

        if (!title) {
            res.status(400).json({ error: "⚠️ Title is required" });
            return;
        }

        const containerRef = db.collection(SECOND_BRAIN_COLLECTION).doc();
        await containerRef.set({ title, isContainer: true, parentContainer: parentContainer, domain, createdAt });

        const containerDoc = await containerRef.get();
        res.json({ id: containerRef.id, ...containerDoc.data() });
    } catch (error) {
        logger.error("Error creating container", error);
        res.status(500).json({ error: "Error creating container", message: error });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { title, parentContainer, domain } = req.body;
        const { id } = req.params;

        if (!title) {
            res.status(400).json({ error: "⚠️ Title is required" });
            return;
        }

        const containerRef = db.collection(SECOND_BRAIN_COLLECTION).doc(id);
        const containerDoc = await containerRef.get();

        if (!containerDoc.exists) {
            res.status(404).json({ error: "⚠️ Container not found" });
            return;
        }

        await containerRef.update({
            title,
            parentContainer,
            domain,
        });

        res.json({ id: containerRef.id, ...containerDoc.data() });
    } catch (error) {
        logger.error("Error updating container", error);
        res.status(500).json({ error: "Error updating container", message: error });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const containerRef = db.collection(SECOND_BRAIN_COLLECTION).doc(id);
        const containerDoc = await containerRef.get();

        if (!containerDoc.exists) {
            res.status(404).json({ error: "⚠️ Container not found" });
            return;
        }

        // Delete related post entries where parentContainer matches the container id
        const relatedPostsSnapshot = await db.collection('post-v3')
            .where('parentContainer', '==', id)
            .get();

        const batch = db.batch();
        relatedPostsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Delete the container itself
        batch.delete(containerRef);

        await batch.commit();

        res.json({ message: "Container and related posts deleted successfully" });
    } catch (error) {
        logger.error("Error deleting container", error);
        res.status(500).json({ error: "Error deleting container", message: error });
    }
});

module.exports = router;