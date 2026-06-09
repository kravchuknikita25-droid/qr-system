const db = require("./database");
const express = require("express");
const QRCode = require("qrcode");
const session = require("express-session");

const app = express();

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "qr-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (
    email === "admin@test.com" &&
    password === "123456"
  ) {
    req.session.user = {
      email,
    };

    return res.redirect("/dashboard");
  }

  res.send("Неверный логин или пароль");
});

app.get("/dashboard", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    db.all(
        "SELECT * FROM qr_codes",
        [],
        (err, rows) => {

            let totalClicks = 0;

            rows.forEach(qr => {
                totalClicks += qr.clicks;
            });

            res.render("dashboard", {
                user: req.session.user,
                qrCodes: rows,
                totalQr: rows.length,
                totalClicks: totalClicks,
                activeLinks: rows.length
            });

        }
    );

});

app.get("/create", (req, res) => {
  res.render("create");
});

app.post("/create", async (req, res) => {

    const { title, url } = req.body;

    db.run(
        `
        INSERT INTO qr_codes(title,url)
        VALUES(?,?)
        `,
        [title,url]
    );

    const qrSvg = await QRCode.toString(url,{
        type:"svg",
        margin:4
    });

    res.send(`
<!DOCTYPE html>
<html>

<head>

<style>

body{
    text-align:center;
    font-family:Arial;
    margin-top:40px;
}

svg{
    width:300px;
    height:300px;
}

</style>

</head>

<body>

<h1>${title}</h1>

${qrSvg}

<p>${url}</p>

<br>

<a href="/dashboard">
Назад в Dashboard
</a>

</body>
</html>
`);

});

app.get("/q/:id", (req, res) => {

    const id = req.params.id;

    db.get(
        "SELECT * FROM qr_codes WHERE id = ?",
        [id],
        (err, qr) => {

            if (!qr) {
                return res.send("QR не найден");
            }

            db.run(
                `
                UPDATE qr_codes
                SET clicks = clicks + 1
                WHERE id = ?
                `,
                [id]
            );

            res.redirect(qr.url);

        }
    );

});

app.get("/delete/:id", (req, res) => {

    const id = req.params.id;

    db.run(
        "DELETE FROM qr_codes WHERE id = ?",
        [id],
        () => {
            res.redirect("/dashboard");
        }
    );

});

app.get("/stats", (req, res) => {

    db.all(
        "SELECT * FROM qr_codes ORDER BY clicks DESC",
        [],
        (err, rows) => {

            let totalClicks = 0;

            rows.forEach(qr => {
                totalClicks += qr.clicks;
            });

            res.render("stats", {
                qrCodes: rows,
                totalClicks
            });

        }
    );

});

app.get("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/login");

    });

});

app.listen(3000, () => {
  console.log("Сервер запущен");
});