import validateFirebaseIdToken from "./authMiddleware";

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const cors = require('cors')
const express = require('express');

const postRoutes = require('./postRoutes');

initializeApp();

const app = express();

app.use(validateFirebaseIdToken);

app.use(express.json());
app.use(cors());

app.use('/posts', postRoutes)

exports.blog = onRequest(app);