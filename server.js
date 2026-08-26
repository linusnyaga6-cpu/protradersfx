```javascript
"use strict";

const express = require("express");
const path = require("path");

const app = express();

const BASE_URL = (
  process.env.BASE_URL ||
  "https://www.protradersfx.com"
).replace(/\/+$/, "");

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID ||
  "348m9hYwW0YkB5rM2ki9f";

const CALLBACK_URL =
  BASE_URL + "/oauth/callback";


/* =========================================================
   BASIC EXPRESS
   ========================================================= */

app.disable("x-powered-by");

app.use(express.json());

app.use(express.urlencoded({
  extended: true
}));


/* =========================================================
   HEALTH
   ========================================================= */

app.get("/health", function (req, res) {

  res.status(200).json({
    ok: true,
    service: "protraders-fx",
    time: new Date().toISOString(),
    oauthConfigured: Boolean(DERIV_CLIENT_ID),
    baseUrl: BASE_URL,
    callback: CALLBACK_URL
  });

});


/* =========================================================
   CONFIG
   ========================================================= */

app.get("/api/config", function (req, res) {

  res.status(200).json({
    ok: true,
    oauthConfigured: Boolean(DERIV_CLIENT_ID),
    baseUrl: BASE_URL,
    callback: CALLBACK_URL
  });

});


/* =========================================================
   FAVICON
   ========================================================= */

app.get("/favicon.ico", function (req, res) {

  res.status(204).end();

});


/* =========================================================
   FRONTEND
   ========================================================= */

app.get("/", function (req, res) {

  res.sendFile(
    path.join(__dirname, "index.html"),
    function (error) {

      if (error) {

        console.error(
          "INDEX ERROR:",
          error
        );

        if (!res.headersSent) {

          res.status(404).send(
            "ProTraders FX index.html not found."
          );

        }

      }

    }
  );

});


/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
  express.static(__dirname, {
    index: false,
    dotfiles: "ignore"
  })
);


/* =========================================================
   404
   ========================================================= */

app.use(function (req, res) {

  res.status(404).json({
    ok: false,
    error: "NOT_FOUND",
    path: req.path
  });

});


/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(function (
  error,
  req,
  res,
  next
) {

  console.error(
    "PROTRADERS FX SERVER ERROR:",
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    ok: false,
    error: "INTERNAL_SERVER_ERROR"
  });

});


/* =========================================================
   VERCEL
   ========================================================= */

module.exports = app;


/* =========================================================
   LOCAL DEVELOPMENT
   ========================================================= */

if (require.main === module) {

  const PORT =
    process.env.PORT || 3000;

  app.listen(
    PORT,
    function () {

      console.log(
        "PROTRADERS FX SERVER RUNNING"
      );

      console.log(
        "http://localhost:" + PORT
      );

    }
  );

}
```
