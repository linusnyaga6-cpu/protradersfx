"use strict";

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString()
  });
});

app.get("/api/config", (req, res) => {
  res.status(200).json({
    ok: true,
    oauthConfigured: Boolean(process.env.DERIV_CLIENT_ID),
    baseUrl: process.env.BASE_URL || "https://www.protradersfx.com",
    callback:
      (process.env.BASE_URL || "https://www.protradersfx.com") +
      "/oauth/callback"
  });
});

app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

app.get("/api/track", (req, res) => {
  res.status(200).json({
    ok: true
  });
});

app.get("/api/analytics", (req, res) => {
  res.status(200).json({
    ok: true,
    visits: 0
  });
});

app.get("/", (req, res) => {
  res.status(200).send("ProTraders FX");
});

module.exports = app;
