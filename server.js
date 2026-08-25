require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();

const PORT = Number(process.env.PORT || 3000);

const BASE_URL = (
  process.env.BASE_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, '');

const DERIV_CLIENT_ID =
  process.env.DERIV_CLIENT_ID || '';

const DERIV_AFFILIATE_PARAM =
  process.env.DERIV_AFFILIATE_PARAM || 't';

const DERIV_AFFILIATE_TOKEN =
  process.env.DERIV_AFFILIATE_TOKEN || '';

const DERIV_AFFILIATE_ID =
  process.env.DERIV_AFFILIATE_ID || '';

const DERIV_CAMPAIGN =
  process.env.DERIV_CAMPAIGN ||
  'protraders-fx';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString('hex');

const PUBLIC_DIR = __dirname;

const sessions = new Map();

let analyticsData = {
  visitors: 0,
  registrations: 0,
  events: []
};


/* =====================================================
   HELPERS
===================================================== */

function readData() {
  return analyticsData;
}

function writeData(data) {
  analyticsData = data;
}

function hashIp(ip) {
  return crypto
    .createHash('sha256')
    .update(`${ip}|${SESSION_SECRET}`)
    .digest('hex')
    .slice(0, 16);
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function encrypt(obj) {
  const iv = crypto.randomBytes(12);

  const key = crypto
    .createHash('sha256')
    .update(SESSION_SECRET)
    .digest();

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    key,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify(obj),
      'utf8'
    ),
    cipher.final()
  ]);

  return [
    base64url(iv),
    base64url(cipher.getAuthTag()),
    base64url(encrypted)
  ].join('.');
}

function decrypt(token) {
  const [iv, tag, data] =
    String(token).split('.');

  if (!iv || !tag || !data) {
    throw new Error('Invalid state');
  }

  const key = crypto
    .createHash('sha256')
    .update(SESSION_SECRET)
    .digest();

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64url')
    );

  decipher.setAuthTag(
    Buffer.from(tag, 'base64url')
  );

  const decrypted = Buffer.concat([
    decipher.update(
      Buffer.from(
        data,
        'base64url'
      )
    ),
    decipher.final()
  ]);

  return JSON.parse(
    decrypted.toString('utf8')
  );
}

function pkceVerifier() {
  return base64url(
    crypto.randomBytes(64)
  );
}

function challenge(verifier) {
  return base64url(
    crypto
      .createHash('sha256')
      .update(verifier)
      .digest()
  );
}


/* =====================================================
   CORS
===================================================== */

const allowedOrigins =
  process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS
        .split(',')
        .map((s) => s.trim())
    : [BASE_URL];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);


/* =====================================================
   SECURITY
===================================================== */

/*
 * IMPORTANT:
 *
 * Deriv's public market-data WebSocket is:
 *
 * wss://ws.binaryws.com/websockets/v3
 *
 * Therefore it MUST be included in connect-src.
 */

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {

        defaultSrc: [
          "'self'"
        ],

        connectSrc: [
          "'self'",

          'https://auth.deriv.com',

          'https://api.deriv.com',

          'https://api.derivws.com',

          'wss://*.derivws.com',

          'wss://*.deriv.com',

          'wss://ws.binaryws.com'
        ],

        scriptSrc: [
          "'self'"
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'"
        ],

        imgSrc: [
          "'self'",
          'data:',
          'https:'
        ],

        fontSrc: [
          "'self'",
          'data:',
          'https:'
        ],

        frameSrc: [
          "'self'",
          'https://auth.deriv.com',
          'https://*.deriv.com'
        ],

        frameAncestors: [
          "'none'"
        ],

        objectSrc: [
          "'none'"
        ],

        baseUri: [
          "'self'"
        ],

        formAction: [
          "'self'",
          'https://auth.deriv.com',
          'https://*.deriv.com'
        ]
      }
    },

    referrerPolicy: {
      policy:
        'strict-origin-when-cross-origin'
    }
  })
);

app.disable(
  'x-powered-by'
);


/* =====================================================
   BODY PARSING
===================================================== */

app.use(
  express.json({
    limit: '20kb'
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: '20kb'
  })
);

app.use(cookieParser());


/* =====================================================
   RATE LIMIT
===================================================== */

const apiLimiter =
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    max: 120,

    standardHeaders: true,

    legacyHeaders: false
  });

app.use(
  '/api/',
  apiLimiter
);


/* =====================================================
   API CONFIG
===================================================== */

app.get(
  '/api/config',
  (req, res) => {

    res.json({
      configured: Boolean(
        DERIV_CLIENT_ID &&
        DERIV_AFFILIATE_TOKEN
      ),

      partnerParam:
        DERIV_AFFILIATE_PARAM,

      campaign:
        DERIV_CAMPAIGN
    });
  }
);


/* =====================================================
   ANALYTICS
===================================================== */

app.post(
  '/api/track',
  (req, res) => {

    const type =
      String(
        req.body?.type ||
        'page_view'
      ).slice(0, 40);

    const data = readData();

    if (type === 'page_view') {
      data.visitors += 1;
    }

    data.events.push({
      type,

      at:
        new Date().toISOString(),

      ip:
        hashIp(req.ip),

      path:
        String(
          req.body?.path ||
          '/'
        ).slice(0, 200)
    });

    if (
      data.events.length >
      5000
    ) {
      data.events =
        data.events.slice(-5000);
    }

    writeData(data);

    res.status(204).end();
  }
);

app.get(
  '/api/analytics',
  (req, res) => {

    const data = readData();

    const registrations =
      data.events.filter(
        (event) =>
          event.type ===
          'registration_complete'
      ).length;

    const successful =
      data.events.filter(
        (event) =>
          event.type ===
          'oauth_success'
      ).length;

    res.json({
      visitors:
        data.visitors,

      registrations:
        Math.max(
          data.registrations || 0,
          registrations
        ),

      oauthSuccesses:
        successful,

      fundedAccounts:
        null,

      note:
        'Funded-account status is not fabricated; use Deriv Partner Hub for confirmed funded/trading referrals.'
    });
  }
);


/* =====================================================
   DERIV OAUTH
===================================================== */

function buildDerivOAuthUrl(
  req,
  mode
) {

  if (!DERIV_CLIENT_ID) {
    throw new Error(
      'Deriv OAuth client is not configured'
    );
  }

  const verifier =
    pkceVerifier();

  const state =
    encrypt({
      verifier,

      nonce:
        base64url(
          crypto.randomBytes(16)
        ),

      mode,

      iat:
        Date.now()
    });

  const params =
    new URLSearchParams({
      response_type:
        'code',

      client_id:
        DERIV_CLIENT_ID,

      redirect_uri:
        `${BASE_URL}/oauth/callback`,

      scope:
        process.env.DERIV_SCOPE ||
        'trade',

      state,

      code_challenge:
        challenge(verifier),

      code_challenge_method:
        'S256'
    });

  if (mode === 'signup') {

    if (!DERIV_AFFILIATE_TOKEN) {
      throw new Error(
        'Deriv signup attribution is not configured'
      );
    }

    params.set(
      'prompt',
      'registration'
    );

    params.set(
      DERIV_AFFILIATE_PARAM,
      DERIV_AFFILIATE_TOKEN
    );

    params.set(
      'utm_campaign',
      DERIV_CAMPAIGN
    );

    params.set(
      'utm_medium',
      'affiliate'
    );

    if (DERIV_AFFILIATE_ID) {
      params.set(
        'utm_source',
        DERIV_AFFILIATE_ID
      );
    }
  }

  return (
    'https://auth.deriv.com/oauth2/auth?' +
    params.toString()
  );
}


app.get(
  '/api/deriv/signup',
  (req, res) => {

    try {

      res.redirect(
        buildDerivOAuthUrl(
          req,
          'signup'
        )
      );

    } catch (err) {

      res.status(503).json({
        error:
          err.message
      });
    }
  }
);


app.get(
  '/api/deriv/login',
  (req, res) => {

    try {

      res.redirect(
        buildDerivOAuthUrl(
          req,
          'login'
        )
      );

    } catch (err) {

      res.status(503).json({
        error:
          err.message
      });
    }
  }
);


/* =====================================================
   OAUTH CALLBACK
===================================================== */

app.get(
  '/oauth/callback',
  async (req, res) => {

    try {

      if (req.query.error) {

        return res.redirect(
          `/?oauth_error=${encodeURIComponent(
            String(req.query.error)
          )}`
        );
      }

      const payload =
        decrypt(
          req.query.state
        );

      if (
        !payload ||
        !payload.verifier ||
        ![
          'signup',
          'login'
        ].includes(
          payload.mode
        )
      ) {
        throw new Error(
          'Invalid OAuth state'
        );
      }

      if (
        Date.now() -
          payload.iat >
        10 * 60 * 1000
      ) {
        throw new Error(
          'Expired OAuth state'
        );
      }

      if (!req.query.code) {
        throw new Error(
          'Missing authorization code'
        );
      }

      if (!DERIV_CLIENT_ID) {
        throw new Error(
          'OAuth client is not configured'
        );
      }

      const body =
        new URLSearchParams({
          grant_type:
            'authorization_code',

          client_id:
            DERIV_CLIENT_ID,

          code:
            String(
              req.query.code
            ),

          code_verifier:
            payload.verifier,

          redirect_uri:
            `${BASE_URL}/oauth/callback`
        });

      const tokenResp =
        await fetch(
          'https://auth.deriv.com/oauth2/token',
          {
            method:
              'POST',

            headers: {
              'content-type':
                'application/x-www-form-urlencoded'
            },

            body
          }
        );

      if (!tokenResp.ok) {
        throw new Error(
          `Token exchange failed (${tokenResp.status})`
        );
      }

      const token =
        await tokenResp.json();

      if (!token.access_token) {
        throw new Error(
          'Token response did not contain an access token'
        );
      }

      const sessionId =
        base64url(
          crypto.randomBytes(32)
        );

      const expiresAt =
        Date.now() +
        Number(
          token.expires_in ||
          3600
        ) *
          1000;

      sessions.set(
        sessionId,
        {
          accessToken:
            token.access_token,

          refreshToken:
            token.refresh_token ||
            null,

          expiresAt
        }
      );

      setTimeout(
        () =>
          sessions.delete(
            sessionId
          ),

        Math.max(
          1,
          Number(
            token.expires_in ||
            3600
          ) * 1000
        )
      );

      const data =
        readData();

      data.events.push({
        type:
          payload.mode === 'signup'
            ? 'oauth_signup_success'
            : 'oauth_login_success',

        at:
          new Date().toISOString(),

        expiresIn:
          token.expires_in ||
          null
      });

      if (
        payload.mode === 'signup'
      ) {

        data.registrations =
          (data.registrations || 0) +
          1;

        data.events.push({
          type:
            'registration_complete',

          at:
            new Date().toISOString()
        });
      }

      writeData(data);

      res.cookie(
        'protraders_session',
        sessionId,
        {
          httpOnly:
            true,

          secure:
            BASE_URL.startsWith(
              'https://'
            ),

          sameSite:
            'lax',

          maxAge:
            Math.max(
              1,
              Number(
                token.expires_in ||
                3600
              ) * 1000
            ),

          path:
            '/'
        }
      );

      res.redirect(
        '/?trading=1'
      );

    } catch (err) {

      console.error(
        'OAuth callback error:',
        err.message
      );

      res.redirect(
        `/?oauth_error=${encodeURIComponent(
          'oauth_failed'
        )}`
      );
    }
  }
);


/* =====================================================
   PREFLIGHT
===================================================== */

app.get(
  '/api/preflight',
  (req, res) => {

    const redirectUri =
      `${BASE_URL}/oauth/callback`;

    res.json({

      productionBaseUrl:
        BASE_URL,

      redirectUri,

      https:
        BASE_URL.startsWith(
          'https://'
        ),

      oauthClientConfigured:
        Boolean(
          DERIV_CLIENT_ID &&
          !/^your_|^$/.test(
            DERIV_CLIENT_ID
          )
        ),

      partnerTrackingConfigured:
        Boolean(
          DERIV_AFFILIATE_TOKEN &&
          !/^your_|^$/.test(
            DERIV_AFFILIATE_TOKEN
          )
        ),

      sessionSecretConfigured:
        Boolean(
          process.env.SESSION_SECRET &&
          !/^replace-with-/.test(
            process.env.SESSION_SECRET
          )
        ),

      readyForControlledLiveTest:
        Boolean(
          BASE_URL.startsWith(
            'https://'
          ) &&
          DERIV_CLIENT_ID &&
          DERIV_AFFILIATE_TOKEN &&
          process.env.SESSION_SECRET &&
          !/^replace-with-/.test(
            process.env.SESSION_SECRET
          )
        )
    });
  }
);


/* =====================================================
   SESSION
===================================================== */

app.get(
  '/api/session',
  (req, res) => {

    const sessionId =
      req.cookies?.protraders_session;

    const session =
      sessions.get(
        sessionId
      );

    if (
      !session ||
      Date.now() >=
        session.expiresAt
    ) {

      return res.json({
        authenticated:
          false
      });
    }

    res.json({
      authenticated:
        true,

      expiresAt:
        session.expiresAt
    });
  }
);


/* =====================================================
   HEALTH
===================================================== */

app.get(
  '/health',
  (req, res) => {

    res.json({
      ok: true,

      service:
        'protraders-fx',

      time:
        new Date().toISOString()
    });
  }
);


/* =====================================================
   STATIC FRONTEND
===================================================== */

app.get(
  '/style.css',
  (req, res) => {

    res.type(
      'text/css'
    );

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'style.css'
      )
    );
  }
);


app.get(
  '/app.js',
  (req, res) => {

    res.type(
      'application/javascript'
    );

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'app.js'
      )
    );
  }
);


app.get(
  '/tracker.js',
  (req, res) => {

    res.type(
      'application/javascript'
    );

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'tracker.js'
      )
    );
  }
);


app.use(
  express.static(
    PUBLIC_DIR
  )
);


/* =====================================================
   FRONTEND FALLBACK
===================================================== */

app.get(
  '*',
  (req, res) => {

    res.sendFile(
      path.join(
        PUBLIC_DIR,
        'index.html'
      )
    );
  }
);


/* =====================================================
   ERROR HANDLER
===================================================== */

app.use(
  (err, req, res, next) => {

    console.error(err);

    res.status(500).json({
      error:
        'Internal server error.'
    });
  }
);


/* =====================================================
   LOCAL DEVELOPMENT
===================================================== */

if (require.main === module) {

  app.listen(
    PORT,
    () => {

      console.log(
        `[PROTRADERS FX] running on ${BASE_URL}`
      );
    }
  );
}


module.exports = app;
