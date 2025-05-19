import { Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
const express = require('express');
const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, content, parentContainer, domain } = req.body;
        const db = getFirestore();
        const createdAt = new Date();

        if (!title) {
            res.status(400).json({ error: "⚠️ Title is required" });
            return;
        }

        const postRef = db.collection('post-v3').doc();
        await postRef.set({ title, content: content || '', isContainer: false, parentContainer: parentContainer || '', domain, createdAt })

        res.json({ id: postRef.id, });
    } catch (error) {
        logger.error("Error adding post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getFirestore();

        const post = await db.collection('post-v3').doc(id).get();

        if (!post.exists) {
            res.status(404).json({ error: "⚠️ Post not found" });
            return;
        }

        res.json({ id: post.id, ...post.data() });
    } catch (error) {
        logger.error("Error getting post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { title, content } = req.body;
        const { id } = req.params;
        const db = getFirestore();

        const postRef = db.collection('post-v3').doc(id);
        const post = await postRef.get();

        if (!post.exists) {
            res.status(404).json({ error: "⚠️ Post not found" });
            return;
        }

         await postRef.update({
            content,
            title,
        });

        res.json(post);
    } catch (error) {
        logger.error("Error updating post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getFirestore();

        const postRef = db.collection('post-v3').doc(id);
        const post = await postRef.get();

        if (!post.exists) {
            res.status(404).json({ error: "⚠️ Post not found" });
            return;
        }

        await postRef.delete()

        res.json({ message: "Post and its versions deleted successfully." });
    } catch (error) {
        logger.error("Error deleting post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;