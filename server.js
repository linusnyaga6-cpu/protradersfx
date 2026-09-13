const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({ ok: true, service: 'protraders-fx-runtime-test' }));
app.get('*', (req, res) => res.type('html').send('<!doctype html><title>ProTraders FX</title><h1>ProTraders FX</h1>'));
module.exports = app;
