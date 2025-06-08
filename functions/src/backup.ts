import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

export const dailyBackup = onSchedule({
    schedule: "0 */3 * * *",  // Run every 3 hours (at minute 0)
    region: "us-central1",
    timeoutSeconds: 300
}, async (event) => {
    const db = getFirestore();
    const storage = getStorage();
    const timestamp = new Date().toISOString().split('T')[0];
    const bucket = storage.bucket();

    try {
        logger.info("Starting backup process...");

        // Backup post-v3 collection
        const postSnapshot = await db.collection('post-v3').get();
        const posts = postSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Backup second-brain collection
        const brainSnapshot = await db.collection('second-brain').get();
        const brainDocs = brainSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Save posts to Storage
        const postsFileName = `backups/${timestamp}/posts.json`;
        const postsFile = bucket.file(postsFileName);
        await postsFile.save(JSON.stringify({ timestamp, posts }, null, 2), {
            contentType: 'application/json',
            metadata: {
                timestamp,
                collection: 'post-v3'
            }
        });

        // Save second-brain to Storage
        const brainFileName = `backups/${timestamp}/second-brain.json`;
        const brainFile = bucket.file(brainFileName);
        await brainFile.save(JSON.stringify({ timestamp, entries: brainDocs }, null, 2), {
            contentType: 'application/json',
            metadata: {
                timestamp,
                collection: 'second-brain'
            }
        });

        logger.info(`Backup completed successfully for date: ${timestamp}`);
    } catch (error) {
        logger.error("Backup failed:", error);
        throw error;
    }
});