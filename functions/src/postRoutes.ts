import { Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
const express = require('express');
const router = express.Router();

router.get('/', async (_: Request, res: Response) => {
    try {
        const posts = await getFirestore()
            .collection("posts")
            .get();

        const postsData = posts.docs.map((doc: FirebaseFirestore.DocumentData) => ({ id: doc.id, ...doc.data() }));
        res.json(postsData);
    } catch (error) {
        logger.error("Error getting posts", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const post = await getFirestore()
            .collection("posts")
            .doc(id)
            .get();

        if (!post.exists) {
            res.status(404).json({ error: "Post not found" });
            return;
        }

        res.json({ id: post.id, ...post.data() });
    } catch (error) {
        logger.error("Error getting post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, content } = req.body;

        if (!title || !content) {
            res.status(400).json({ error: "Title and content are required." });
            return;
        }

        const writeResult = await getFirestore()
            .collection("posts")
            .add({ title, content });

        res.json({ id: writeResult.id, });
    } catch (error) {
        logger.error("Error adding post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { title, content } = req.body;
        const { id } = req.params;

        if (!title || !content) {
            res.status(400).json({ error: "Title and content are required." });
            return;
        }

        await getFirestore()
            .collection("posts")
            .doc(id)
            .set({ title, content });

        res.json({ id });
    } catch (error) {
        logger.error("Error updating post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;