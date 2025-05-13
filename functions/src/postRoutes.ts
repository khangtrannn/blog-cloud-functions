import { Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
const express = require('express');
const router = express.Router();

const POSTS_COLLECTION = "posts-v2";
const VERSIONS_COLLECTION = "versions";
// const SECOND_BRAIN = "second-brain";

router.get('/', async (_: Request, res: Response) => {
    try {
        const db = getFirestore();

        // Get all posts ordered by creation date  
        const postsSnapshot = await db.collection(POSTS_COLLECTION)
            .orderBy("createdAt", "desc")
            .get();


        // Combine posts with their active versions  
        const posts = postsSnapshot.docs.map(doc => {
            const postData = doc.data();

            return {
                id: doc.id,
                title: postData.title,
                createdAt: postData.createdAt.toDate(),
                versionId: postData.versionId
            };
        });

        res.json(posts);
    } catch (error) {
        logger.error("Error getting posts", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});



router.get('/second-brain', async (_: Request, res: Response) => {
    try {
            const db = getFirestore();
            const postsSnapshot = await db.collection('post-v3').select("title", "container", "domain").orderBy("createdAt", "desc").get();
            const posts = postsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);
            const secondBrainSnapshot = await db.collection("second-brain").get();
            const secondBrain = secondBrainSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);
    
            const data = [
                {
                    container: "Inbox",
                    title: "Inbox",
                    children: posts.filter(post => post.domain === 'Inbox'),
                },
                {
                    container: "Projects",
                    title: "Projects",
                    childern: secondBrain.filter(doc => doc.domain === "Project").map((doc) => {
                        return {
                            title: doc.title,
                            children: posts.filter(post => post.container === doc.id),
                        }
                    }),
                },
                {
                    container: "Areas",
                    title: "Areas",
                    children: secondBrain.filter(doc => doc.domain === "Area").map((doc) => {
                        return {
                            title: doc.title,
                            children: posts.filter(post => post.container === doc.id),
                        }
                    }),
                },
                {
                    container: "Resources",
                    title: "Resources",
                    children: secondBrain.filter(doc => doc.domain === "Resource").map((doc) => {
                        return {
                            title: doc.title,
                            children: posts.filter(post => post.container === doc.id),
                        }
                    }),
                },
                {
                    container: "Archive",
                    title: "Archive",
                    children: posts.filter(post => post.container === 'Archive'),
                },
            ]
    
            console.log("Data: ", data);
            
        } catch (error) {
            logger.error("Error getting posts", error);
        }
});

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getFirestore();

        const post = await db.collection(POSTS_COLLECTION).doc(id).get();

        if (!post.exists) {
            res.status(404).json({ error: "⚠️ Post not found" });
            return;
        }

        // Get active version 
        const activeVersion = await db
            .collection("versions")
            .doc(post.data()?.versionId)
            .get();

        if (!activeVersion.exists) {
            res.status(404).json({ error: "⚠️ Post version not found" });
            return;
        }

        // Get all versions of the post
        const versionsSnapshot = await db
            .collection(VERSIONS_COLLECTION)
            .where("postId", "==", id)
            .orderBy("createdAt", "desc")
            .get();

        const versions = versionsSnapshot.docs.map(doc => ({
            id: doc.id,
            createdAt: doc.data().createdAt.toDate()
        }));

        res.json({
            id: post.id,
            title: post.data()?.title,
            content: activeVersion.data()?.content,
            versions
        });
    } catch (error) {
        logger.error("Error getting post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, content } = req.body;
        const db = getFirestore();
        const createdAt = new Date();

        if (!title) {
            res.status(400).json({ error: "⚠️ Title is required" });
            return;
        }

        const versionRef = db.collection(VERSIONS_COLLECTION).doc();
        await versionRef.set({ content, createdAt });

        const postRef = db.collection(POSTS_COLLECTION).doc();
        await postRef.set({ title, versionId: versionRef.id, createdAt });

        await versionRef.update({ postId: postRef.id });

        res.json({ id: postRef.id, versionId: versionRef.id });
    } catch (error) {
        logger.error("Error adding post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/versions/:versionId', async (req: Request, res: Response) => {
    try {
        const { versionId } = req.params;
        const db = getFirestore();

        // Get specific version
        const version = await db.collection(VERSIONS_COLLECTION).doc(versionId).get();
        if (!version.exists) {
            res.status(404).json({ error: "⚠️ Version not found" });
            return;
        }

        res.json({
            ...version.data(),
        });
    } catch (error) {
        logger.error("Error getting post version", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { title, content } = req.body;
        const { id } = req.params;
        const db = getFirestore();

        if (!content) {
            res.status(400).json({ error: "⚠️ Content is required." });
            return;
        }

        const postRef = db.collection(POSTS_COLLECTION).doc(id);
        const post = await postRef.get();

        if (!post.exists) {
            res.status(404).json({ error: "⚠️ Post not found" });
            return;
        }

        const versionRef = db.collection(VERSIONS_COLLECTION).doc();
        await versionRef.set({
            content,
            postId: id,
            createdAt: new Date()
        });

        await postRef.update({
            versionId: versionRef.id,
            title,
        });

        res.json({
            id,
            versionId: versionRef.id
        });
    } catch (error) {
        logger.error("Error updating post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const db = getFirestore();

        const postRef = db.collection(POSTS_COLLECTION).doc(id);
        const post = await postRef.get();

        if (!post.exists) {
            res.status(404).json({ error: "⚠️ Post not found" });
            return;
        }

        // Delete all versions associated with the post
        const versionsSnapshot = await db.collection(VERSIONS_COLLECTION)
            .where("postId", "==", id)
            .get();

        const batch = db.batch();
        versionsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Delete the post
        batch.delete(postRef);

        await batch.commit();

        res.json({ message: "Post and its versions deleted successfully." });
    } catch (error) {
        logger.error("Error deleting post", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;