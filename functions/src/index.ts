import { getFirestore } from "firebase-admin/firestore";
import validateFirebaseIdToken from "./authMiddleware";
import { logger } from "firebase-functions/v2";

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

app.use('/posts', postRoutes)

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
                container: null,
                domain: "Inbox",
            });
        }
        );
        await batch.commit();
        console.log("Posts migrated to second-brain collection");

    } catch (error) {
        console.error("Error migrating posts: ", error);
    }
}

export async function migrateSecondBrain() {
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
}

// setTimeout(() => {
//     console.log("Migrating posts...");
//     migrate();
// }, 3000);

setTimeout(() => {
    migrateSecondBrain();
}, 3000);


exports.blog = onRequest(app);