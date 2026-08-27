module.exports = function (req, res) {
  if (req.url === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        service: "protraders-fx",
        time: new Date().toISOString()
      })
    );
    return;
  }

  if (req.url === "/favicon.ico") {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
  res.end("ProTraders FX");
};
