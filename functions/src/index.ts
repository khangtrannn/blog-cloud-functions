import { getFirestore } from "firebase-admin/firestore";
import validateFirebaseIdToken from "./authMiddleware";

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const cors = require('cors')
const express = require('express');

const postRoutes = require('./postRoutes');

initializeApp();

const app = express();

app.use(express.json());
app.use(cors());

app.use(validateFirebaseIdToken);

app.use('/posts', postRoutes);
app.use('/containers', require('./containerRoutes'));

export async function migrate() {
    try {
        const db = getFirestore();

        const postsSnapshot = await db.collection("posts-v2")
            .orderBy("createdAt", "desc")
            .get();

        const versionsSnapshot = await db.collection("versions").get();
        const versions = versionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as any);

        // console.log("Versions: ", versions);

        const posts = postsSnapshot.docs.map((doc) => {
            const postData = doc.data();
            const activeVersion = versions.find(
                version => version.id === postData.versionId
            );

            return {
                id: doc.id,
                title: postData.title,
                content: activeVersion?.content || "",
                createdAt: postData.createdAt.toDate(),
                container: 'Inbox'
            };
        });

        console.log("Posts: ", posts);

        // save posts to second-brain collection
        const secondBrainRef = db.collection("post-v3");
        const batch = db.batch();
        posts.forEach(post => {
            const postRef = secondBrainRef.doc(post.id);
            batch.set(postRef, {
                title: post.title,
                content: post.content || "",
                createdAt: post.createdAt,
                parentContainer: "Us5O53dOxqIYTG972UZM",
                domain: "Archive",
                isContainer: false,
            });
        }
        );
        await batch.commit();
        console.log("Posts migrated to second-brain collection");

    } catch (error) {
        console.error("Error migrating posts: ", error);
    }
}

exports.blog = onRequest(app);