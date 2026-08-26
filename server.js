/* =====================================================
   DERIV TRADING ACCOUNTS
===================================================== */

app.get(
  "/api/deriv/accounts",
  async (req, res) => {

    try {

      const session =
        getSession(req);

      if (!session) {
        return res.status(401).json({
          authenticated: false,
          error: "LOGIN_REQUIRED"
        });
      }

      const response =
        await fetch(
          "https://api.derivws.com/trading/v1/options/accounts",
          {
            method: "GET",

            headers: {
              "Authorization":
                `Bearer ${session.accessToken}`,

              "Deriv-App-ID":
                DERIV_CLIENT_ID,

              "Accept":
                "application/json"
            }
          }
        );

      const text =
        await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = {
          raw: text
        };
      }

      if (!response.ok) {

        console.error(
          "DERIV ACCOUNTS ERROR:",
          response.status,
          data
        );

        return res.status(
          response.status
        ).json({
          authenticated: true,
          error:
            "DERIV_ACCOUNTS_REQUEST_FAILED",
          details:
            data
        });
      }

      return res.json({
        authenticated: true,
        accounts:
          data.data ||
          data.accounts ||
          []
      });

    } catch (error) {

      console.error(
        "DERIV ACCOUNTS REQUEST ERROR:",
        error
      );

      return res.status(500).json({
        authenticated: true,
        error:
          "DERIV_ACCOUNTS_CONNECTION_FAILED"
      });
    }
  }
);


/* =====================================================
   DERIV ACCOUNT WEBSOCKET URL
===================================================== */

app.post(
  "/api/deriv/account/ws",
  async (req, res) => {

    try {

      const session =
        getSession(req);

      if (!session) {
        return res.status(401).json({
          authenticated: false,
          error: "LOGIN_REQUIRED"
        });
      }

      const accountId =
        String(
          req.body?.accountId ||
          ""
        ).trim();

      if (!accountId) {
        return res.status(400).json({
          error:
            "ACCOUNT_ID_REQUIRED"
        });
      }

      const response =
        await fetch(
          `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
          {
            method: "POST",

            headers: {
              "Authorization":
                `Bearer ${session.accessToken}`,

              "Deriv-App-ID":
                DERIV_CLIENT_ID,

              "Accept":
                "application/json"
            }
          }
        );

      const text =
        await response.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        data = {
          raw: text
        };
      }

      if (!response.ok) {

        console.error(
          "DERIV OTP ERROR:",
          response.status,
          data
        );

        return res.status(
          response.status
        ).json({
          error:
            "DERIV_ACCOUNT_WS_FAILED",
          details:
            data
        });
      }

      const wsUrl =
        data?.data?.url;

      if (!wsUrl) {

        console.error(
          "DERIV OTP URL MISSING:",
          data
        );

        return res.status(502).json({
          error:
            "DERIV_WS_URL_MISSING"
        });
      }

      return res.json({
        authenticated: true,
        accountId,
        url: wsUrl
      });

    } catch (error) {

      console.error(
        "DERIV ACCOUNT WS ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "DERIV_ACCOUNT_WS_CONNECTION_FAILED"
      });
    }
  }
);
