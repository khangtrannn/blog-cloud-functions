const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const cors = require('cors')

const postRoutes = require('./postRoutes');

initializeApp();

const express = require('express');
const app = express();

app.use(express.json());
app.use(cors());

app.use('/posts', postRoutes)

exports.blog = onRequest(app);