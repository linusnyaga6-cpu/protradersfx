"use strict";

const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "protraders-fx"
  });
});

// Basic config endpoint
app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    service: "protraders-fx",
    baseUrl: process.env.BASE_URL || "https://www.protradersfx.com"
  });
});

// Serve frontend files
const publicPath = path.join(__dirname, "public");

app.use(express.static(publicPath));

// Fallback to index.html
app.get("*", (req, res) => {
  const indexPath = path.join(publicPath, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send("ProTraders FX");
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`ProTraders FX running on port ${PORT}`);
});

module.exports = app;
