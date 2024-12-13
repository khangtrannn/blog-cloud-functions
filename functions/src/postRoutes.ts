import { Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/scheduler";
import { logger } from "firebase-functions/v2";
const express = require('express');
const router = express.Router();

const POSTS_COLLECTION = "posts-v2";
const VERSIONS_COLLECTION = "versions";
const POSTS_BACKUP_COLLECTION = "posts-v2-backup";
const VERSIONS_BACKUP_COLLECTION = "versions-backup";

// Function to perform the backup  
async function backupPosts() {  
    const postsCollection = await getFirestore().collection(POSTS_COLLECTION);  
    const postsBackupCollection = await getFirestore().collection(POSTS_BACKUP_COLLECTION);  

    const versionsCollection = await getFirestore().collection(VERSIONS_COLLECTION);
    const versionsBackupCollection = await getFirestore().collection(VERSIONS_BACKUP_COLLECTION);

    try {  
        const postsSnapshot = await postsCollection.get();  
        const versionsSnapshot = await versionsCollection.get();

        const batch = await getFirestore().batch();  

        postsSnapshot.forEach(doc => {  
            const data = doc.data();  
            const backupDocRef = postsBackupCollection.doc(doc.id);  
            batch.set(backupDocRef, data);  
        });

        versionsSnapshot.forEach(doc => {
            const data = doc.data();
            const backupDocRef = versionsBackupCollection.doc(doc.id);
            batch.set(backupDocRef, data);
        });

        await batch.commit();  
        console.log('Backup completed successfully.');  
        return { success: true };  
    } catch (error) {  
        console.error('Error backing up posts:', error);  
        return { success: false, error };  
    }  
}  

exports.scheduledBackupPosts = onSchedule("every day 00:00", async () => {
    await backupPosts();
});

// Route to manually trigger the backup  
router.post('/backup', async (req: Request, res: Response) => {  
    const result = await backupPosts();  
    if (result.success) {  
        res.json({ message: 'Backup completed successfully.' });  
    } else {  
        res.status(500).json({ error: 'Error backing up posts', details: result.error });  
    }  
});  

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

module.exports = router;