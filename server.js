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

let analyticsData = {
  visitors: 0,
  registrations: 0,
  events: []
};


/* =====================================================
   PROXY
===================================================== */

/*
 * Vercel sits behind a proxy and sends
 * X-Forwarded-For.
 *
 * Trust the first proxy so express-rate-limit
 * can correctly identify clients.
 */

app.set('trust proxy', 1);


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


/* =====================================================
   ENCRYPTION
===================================================== */

function encryptionKey() {
  return crypto
    .createHash('sha256')
    .update(SESSION_SECRET)
    .digest();
}


function encrypt(obj) {
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    encryptionKey(),
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
  const parts =
    String(token || '').split('.');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token');
  }

  const [iv, tag, data] = parts;

  const decipher =
    crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(iv, 'base64url')
    );

  decipher.setAuthTag(
    Buffer.from(tag, 'base64url')
  );

  const decrypted = Buffer.concat([
    decipher.update(
      Buffer.from(data, 'base64url')
    ),
    decipher.final()
  ]);

  return JSON.parse(
    decrypted.toString('utf8')
  );
}


/* =====================================================
   PKCE
===================================================== */

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

app.disable('x-powered-by');


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
          'oauth_login_success' ||
          event.type ===
          'oauth_signup_success'
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
   DERIV OAUTH URL
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

  /*
   * OAuth state is encrypted.
   *
   * The verifier is stored inside the
   * encrypted state so it survives the
   * serverless request boundary.
   */

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


/* =====================================================
   SIGNUP
===================================================== */

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

      console.error(
        'Deriv signup error:',
        err.message
      );

      res.status(503).json({
        error:
          err.message
      });
    }
  }
);


/* =====================================================
   LOGIN
===================================================== */

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

      console.error(
        'Deriv login error:',
        err.message
      );

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

      /* ---------------------------------------------
         DERIV RETURNED AN OAUTH ERROR
      --------------------------------------------- */

      if (req.query.error) {

        console.error(
          'Deriv OAuth error:',
          req.query.error,
          req.query.error_description || ''
        );

        return res.redirect(
          `/?oauth_error=${encodeURIComponent(
            String(req.query.error)
          )}`
        );
      }


      /* ---------------------------------------------
         VERIFY STATE
      --------------------------------------------- */

      if (!req.query.state) {
        throw new Error(
          'Missing OAuth state'
        );
      }

      const payload =
        decrypt(
          String(
            req.query.state
          )
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


      /* ---------------------------------------------
         STATE EXPIRATION
      --------------------------------------------- */

      if (
        Date.now() -
          Number(payload.iat || 0) >
        10 * 60 * 1000
      ) {
        throw new Error(
          'Expired OAuth state'
        );
      }


      /* ---------------------------------------------
         AUTHORIZATION CODE
      --------------------------------------------- */

      if (!req.query.code) {
        throw new Error(
          'Missing authorization code'
        );
      }


      /* ---------------------------------------------
         CLIENT ID
      --------------------------------------------- */

      if (!DERIV_CLIENT_ID) {
        throw new Error(
          'OAuth client is not configured'
        );
      }


      /* ---------------------------------------------
         TOKEN EXCHANGE
      --------------------------------------------- */

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
                'application/x-www-form-urlencoded',

              'accept':
                'application/json'
            },

            body
          }
        );


      if (!tokenResp.ok) {

        const errorText =
          await tokenResp.text();

        console.error(
          'Deriv token exchange failed:',
          tokenResp.status,
          errorText
        );

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


      /* ---------------------------------------------
         SESSION EXPIRATION
      --------------------------------------------- */

      const expiresIn =
        Math.max(
          60,
          Number(
            token.expires_in ||
            3600
          )
        );

      const expiresAt =
        Date.now() +
        expiresIn * 1000;


      /* ---------------------------------------------
         SERVERLESS-SAFE SESSION
         
         IMPORTANT:
         
         Do NOT store the session in a Map.
         
         The encrypted session is placed inside
         an HttpOnly cookie so another Vercel
         invocation can read it.
      --------------------------------------------- */

      const sessionToken =
        encrypt({

          accessToken:
            token.access_token,

          refreshToken:
            token.refresh_token ||
            null,

          expiresAt,

          createdAt:
            Date.now()
        });


      /* ---------------------------------------------
         COOKIE
      --------------------------------------------- */

      res.cookie(
        'protraders_session',
        sessionToken,
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
            expiresIn * 1000,

          path:
            '/'
        }
      );


      /* ---------------------------------------------
         ANALYTICS
      --------------------------------------------- */

      const data =
        readData();


      data.events.push({

        type:
          payload.mode === 'signup'
            ? 'oauth_signup_success'
            : 'oauth_login_success',

        at:
          new Date().toISOString(),

        expiresIn
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


      console.log(
        'DERIV OAUTH SUCCESS:',
        payload.mode
      );


      /* ---------------------------------------------
         RETURN TO APPLICATION
      --------------------------------------------- */

      return res.redirect(
        '/?trading=1'
      );


    } catch (err) {

      console.error(
        'OAuth callback error:',
        err.message
      );

      return res.redirect(
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

    const sessionToken =
      req.cookies?.protraders_session;


    /* ---------------------------------------------
       NO COOKIE
    --------------------------------------------- */

    if (!sessionToken) {

      return res.json({
        authenticated:
          false
      });
    }


    try {

      const session =
        decrypt(
          sessionToken
        );


      /* -------------------------------------------
         EXPIRED SESSION
      ------------------------------------------- */

      if (
        !session ||
        !session.accessToken ||
        !session.expiresAt ||
        Date.now() >=
          Number(
            session.expiresAt
          )
      ) {

        res.clearCookie(
          'protraders_session',
          {
            httpOnly:
              true,

            secure:
              BASE_URL.startsWith(
                'https://'
              ),

            sameSite:
              'lax',

            path:
              '/'
          }
        );

        return res.json({
          authenticated:
            false
        });
      }


      /* -------------------------------------------
         VALID SESSION
      ------------------------------------------- */

      return res.json({

        authenticated:
          true,

        expiresAt:
          Number(
            session.expiresAt
          )
      });


    } catch (err) {

      console.error(
        'Session validation error:',
        err.message
      );

      res.clearCookie(
        'protraders_session',
        {
          httpOnly:
            true,

          secure:
            BASE_URL.startsWith(
              'https://'
            ),

          sameSite:
            'lax',

          path:
            '/'
        }
      );

      return res.json({
        authenticated:
          false
      });
    }
  }
);


/* =====================================================
   LOGOUT
===================================================== */

app.get(
  '/api/logout',
  (req, res) => {

    res.clearCookie(
      'protraders_session',
      {
        httpOnly:
          true,

        secure:
          BASE_URL.startsWith(
            'https://'
          ),

        sameSite:
          'lax',

        path:
          '/'
      }
    );

    res.redirect('/');
  }
);


/* =====================================================
   HEALTH
===================================================== */

app.get(
  '/health',
  (req, res) => {

    res.json({

      ok:
        true,

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

    console.error(
      'SERVER ERROR:',
      err
    );

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
