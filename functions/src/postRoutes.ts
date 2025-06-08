import { Request, Response } from "express";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
const express = require('express');
const router = express.Router();
const Fuse = require('fuse.js');
import type { FuseResult } from 'fuse.js';

type Post = {
    id: string;
    title?: string;
    content?: string;
    isContainer?: boolean;
    parentContainer?: string;
    domain?: string;
    createdAt?: any;
};

router.get('/search', async (req: Request, res: Response) => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Query parameter q is required' });
        }
        
        const searchTerm = q.trim();
        logger.info(`Searching for term: "${searchTerm}"`);
        
        const db = getFirestore();
        const snapshot = await db.collection('post-v3').get();
        const posts: Post[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // APPROACH 1: Direct string search for exact matches
        const directResults = [];
        
        for (const post of posts) {
            const content = String(post.content || '');
            const title = String(post.title || '');
            const snippets = [];
            
            // Case insensitive search
            const contentLower = content.toLowerCase();
            const searchTermLower = searchTerm.toLowerCase();
            let index = contentLower.indexOf(searchTermLower);
            
            // Find all occurrences in content
            while (index !== -1) {
                const start = index;
                const end = index + searchTerm.length - 1;
                
                // Extract snippet with context
                let snippetStart = Math.max(0, start - 100);
                let snippetEnd = Math.min(content.length, end + 100);
                
                // Adjust snippet boundaries to respect word boundaries
                if (snippetStart > 0) {
                    // Look for the nearest space before snippetStart and start there
                    const prevSpace = content.lastIndexOf(' ', snippetStart);
                    if (prevSpace !== -1 && snippetStart - prevSpace < 15) {
                        snippetStart = prevSpace + 1;
                    } else {
                        // Try to find a newline character
                        const prevNewline = content.lastIndexOf('\n', snippetStart);
                        if (prevNewline !== -1 && snippetStart - prevNewline < 15) {
                            snippetStart = prevNewline + 1;
                        }
                    }
                }
                
                if (snippetEnd < content.length) {
                    // Look for the nearest space after snippetEnd and end there
                    const nextSpace = content.indexOf(' ', snippetEnd);
                    if (nextSpace !== -1 && nextSpace - snippetEnd < 15) {
                        snippetEnd = nextSpace;
                    } else {
                        // Try to find a newline character
                        const nextNewline = content.indexOf('\n', snippetEnd);
                        if (nextNewline !== -1 && nextNewline - snippetEnd < 15) {
                            snippetEnd = nextNewline;
                        }
                    }
                }
                
                const snippet = content.substring(snippetStart, snippetEnd);
                
                snippets.push({
                    text: snippet,
                    position: { start, end },
                    highlight: content.substring(start, end + 1)
                });
                
                // Find next occurrence
                index = contentLower.indexOf(searchTermLower, start + 1);
            }
            
            // Check if title contains the search term
            if (title.toLowerCase().includes(searchTermLower)) {
                snippets.push({
                    text: title,
                    position: { 
                        start: title.toLowerCase().indexOf(searchTermLower), 
                        end: title.toLowerCase().indexOf(searchTermLower) + searchTermLower.length - 1 
                    },
                    highlight: title.substring(
                        title.toLowerCase().indexOf(searchTermLower),
                        title.toLowerCase().indexOf(searchTermLower) + searchTermLower.length
                    ),
                    isTitle: true
                });
            }
            
            if (snippets.length > 0) {
                directResults.push({
                    id: post.id,
                    title: post.title,
                    isContainer: post.isContainer,
                    parentContainer: post.parentContainer,
                    domain: post.domain,
                    createdAt: post.createdAt,
                    matchCount: snippets.length,
                    snippets: snippets
                });
            }
        }
        
        // APPROACH 2: If direct search found nothing, use Fuse.js with very loose settings
        let finalResults = directResults;
        
        if (directResults.length === 0) {
            const fuse = new Fuse(posts, {
                keys: ['content', 'title'],
                includeMatches: true,
                threshold: 0.6,        // Very loose threshold
                minMatchCharLength: 2,
                ignoreLocation: true,
                distance: 200
            });
            
            const fuseResults = fuse.search(searchTerm);
            
            finalResults = fuseResults.map((result: FuseResult<any>) => {
                const item = result.item;
                const matches = result.matches || [];
                const snippets = [] as any[];
                const content = String(item.content || '');
                
                // Process matches from Fuse.js
                matches.forEach(match => {
                    if (match.indices && match.indices.length > 0) {
                        match.indices.forEach(([start, end]) => {
                            let text;
                            
                            if (match.key === 'title') {
                                // For title matches, use the title as is
                                text = String(item.title || '');
                            } else {
                                // For content matches, respect word boundaries
                                let snippetStart = Math.max(0, start - 100);
                                let snippetEnd = Math.min(content.length, end + 100);
                                
                                // Adjust snippet boundaries to respect word boundaries
                                if (snippetStart > 0) {
                                    // Look for the nearest space before snippetStart and start there
                                    const prevSpace = content.lastIndexOf(' ', snippetStart);
                                    if (prevSpace !== -1 && snippetStart - prevSpace < 15) {
                                        snippetStart = prevSpace + 1;
                                    } else {
                                        // Try to find a newline character
                                        const prevNewline = content.lastIndexOf('\n', snippetStart);
                                        if (prevNewline !== -1 && snippetStart - prevNewline < 15) {
                                            snippetStart = prevNewline + 1;
                                        }
                                    }
                                }
                                
                                if (snippetEnd < content.length) {
                                    // Look for the nearest space after snippetEnd and end there
                                    const nextSpace = content.indexOf(' ', snippetEnd);
                                    if (nextSpace !== -1 && nextSpace - snippetEnd < 15) {
                                        snippetEnd = nextSpace;
                                    } else {
                                        // Try to find a newline character
                                        const nextNewline = content.indexOf('\n', snippetEnd);
                                        if (nextNewline !== -1 && nextNewline - snippetEnd < 15) {
                                            snippetEnd = nextNewline;
                                        }
                                    }
                                }
                                
                                text = content.substring(snippetStart, snippetEnd);
                            }
                                
                            const highlight = match.key === 'content'
                                ? content.substring(start, end + 1)
                                : String(item.title || '').substring(start, end + 1);
                            
                            snippets.push({
                                text,
                                position: { start, end },
                                highlight,
                                isTitle: match.key === 'title'
                            });
                        });
                    }
                });
                
                return {
                    id: item.id,
                    title: item.title,
                    isContainer: item.isContainer,
                    parentContainer: item.parentContainer,
                    domain: item.domain,
                    createdAt: item.createdAt,
                    matchCount: snippets.length,
                    snippets
                };
            });
        }
        
        logger.info(`Found ${finalResults.length} results for "${searchTerm}"`);
        return res.json(finalResults);
    } catch (error) {
        logger.error('Error searching posts', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});

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
        const { title, content, parentContainer, domain } = req.body;
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
            domain,
            parentContainer,
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