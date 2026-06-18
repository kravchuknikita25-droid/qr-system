const db = require("./database");
const express = require("express");
const QRCode = require("qrcode");
const session = require("express-session");
const bcrypt = require("bcrypt");
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

app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async (req, res) => {

    const { email, password } = req.body;

    const hashedPassword =
        await bcrypt.hash(password, 10);

    db.run(
        `
       INSERT INTO users(
    email,
    password,
    created_at
)
VALUES(
    ?, ?, date('now')
)
        `,
        [email, hashedPassword],
        (err) => {

            if (err) {
                return res.send("Пользователь уже существует");
            }

            res.redirect("/");
        }
    );

});

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {

    const { email, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],

        async (err, user) => {

            if (!user) {
                return res.send("Пользователь не найден");
            }

            const match =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (!match) {
                return res.send("Неверный пароль");
            }

           req.session.user = {
    id: user.id,
    email: user.email,
    is_admin: user.is_admin
};

            res.redirect("/dashboard");
        }
    );

});

app.get("/dashboard", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

   db.all(
    "SELECT * FROM qr_codes WHERE user_id = ?",
    [req.session.user.id],
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
       INSERT INTO qr_codes(
    title,
    url,
    user_id
)
VALUES(?, ?, ?)
        `,
       [
    title,
    url,
    req.session.user.id
],

        async function(err) {

            if (err) {
                return res.send("Ошибка создания QR");
            }

            const id = this.lastID;

            const shortUrl =
                `https://qr-system-dxto.onrender.com/r/${id}`;

            const qrSvg = await QRCode.toString(shortUrl, {
                type: "svg",
                margin: 4
            });

           res.send(`

<!DOCTYPE html>

<html lang="ru">

<head>

<meta charset="UTF-8">

<title>QR создан</title>

<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">

<style>

body{
    background:#f5f7fb;
    font-family:Arial;
}

.card{
    max-width:700px;
    margin:50px auto;
    border:none;
    border-radius:20px;
    box-shadow:0 5px 20px rgba(0,0,0,.08);
}

svg{
    width:280px;
    height:280px;
}

</style>

</head>

<body>

<div class="card">


<div class="card-body text-center">

    <h2 class="mb-4">
        QR успешно создан
    </h2>

    ${qrSvg}

    <h5 class="mt-4">
        Короткая ссылка
    </h5>

    <input
        id="shortUrl"
        class="form-control text-center"
        value="${shortUrl}"
        readonly
    >

    <br>

    <button
        class="btn btn-primary"
        onclick="copyLink()"
    >
        Скопировать ссылку
    </button>

    <a
        href="/download/png/${id}"
        class="btn btn-success"
    >
        Скачать PNG
    </a>

    <a
        href="/download/svg/${id}"
        class="btn btn-info"
    >
        Скачать SVG
    </a>

    <br><br>

    <a
        href="/dashboard"
        class="btn btn-secondary"
    >
        Назад в Dashboard
    </a>

</div>


</div>

<script>

function copyLink(){

    const input =
        document.getElementById("shortUrl");

    navigator.clipboard.writeText(
        input.value
    );

    alert("Ссылка скопирована");

}

</script>

</body>

</html>
`);

        }
    );
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

app.get("/edit/:id", (req, res) => {

    const id = req.params.id;

    db.get(
        "SELECT * FROM qr_codes WHERE id = ?",
        [id],
        (err, qr) => {

            if (!qr) {
                return res.send("QR не найден");
            }

            res.render("edit", {
                qr
            });

        }
    );

});

app.post("/edit/:id", (req, res) => {

    const id = req.params.id;

    const { title, url } = req.body;

    db.run(
        `
        UPDATE qr_codes
        SET title = ?, url = ?
        WHERE id = ?
        `,
        [title, url, id],
        () => {

            res.redirect("/dashboard");

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

const period = req.query.period || "7";

    if (!req.session.user) {
        return res.redirect("/login");
    }

    db.all(
        `
        SELECT *
        FROM qr_codes
        WHERE user_id = ?
        ORDER BY clicks DESC
        `,
        [req.session.user.id],

        (err, rows) => {

            if (err) {
                return res.send("Ошибка статистики");
            }

            let totalClicks = 0;

            rows.forEach(qr => {
                totalClicks += qr.clicks;
            });

            db.all(
    `
    SELECT
        visit_date,
        COUNT(*) as clicks
    FROM visits
    WHERE visit_date >= date('now', '-${period} days')
    GROUP BY visit_date
    ORDER BY visit_date
    `,
    [],

                (err, visits) => {

                    db.all(
                        `
                        SELECT
                            source,
                            COUNT(*) as total
                        FROM visits
                        GROUP BY source
                        `,
                        [],

                        (err, sources) => {

                            res.render("stats", {
                            qrCodes: rows,
                            totalClicks,
                            visits,
                            sources,
                            period
                         });

                        }
                    );

                }
            );

        }
    );

});

app.get("/logout", (req, res) => {

    req.session.destroy(() => {

        res.redirect("/login");

    });

});

app.get("/r/:id", (req, res) => {

    const id = req.params.id;

    db.get(
        "SELECT * FROM qr_codes WHERE id = ?",
        [id],
        (err, row) => {

            if (err || !row) {
                return res.send("QR код не найден");
            }

            db.run(
                "UPDATE qr_codes SET clicks = clicks + 1 WHERE id = ?",
                [id]
            );
const referer = req.get("Referer") || "";

let source = "direct";

if (referer.includes("google")) {
    source = "search";
}
else if (
    referer.includes("facebook") ||
    referer.includes("instagram") ||
    referer.includes("twitter")
) {
    source = "social";
}

db.run(
    `
    INSERT INTO visits(
        qr_id,
        visit_date,
        source
    )
    VALUES(
        ?,
        date('now'),
        ?
    )
    `,
    [id, source]
);
            res.redirect(row.url);
        }
    );

});

app.get("/download/png/:id", (req, res) => {

    const id = req.params.id;

    db.get(
        "SELECT * FROM qr_codes WHERE id = ?",
        [id],
        async (err, qr) => {

            if (!qr) {
                return res.send("QR не найден");
            }

            const shortUrl =
                `https://qr-system-dxto.onrender.com/r/${id}`;

            const pngBuffer =
                await QRCode.toBuffer(shortUrl);

            res.setHeader(
                "Content-Type",
                "image/png"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename=qr-${id}.png`
            );

            res.send(pngBuffer);
        }
    );
});

app.get("/download/svg/:id", (req, res) => {

    const id = req.params.id;

    db.get(
        "SELECT * FROM qr_codes WHERE id = ?",
        [id],
        async (err, qr) => {

            if (!qr) {
                return res.send("QR не найден");
            }

            const shortUrl =
                `https://qr-system-dxto.onrender.com/r/${id}`;

            const svg =
                await QRCode.toString(
                    shortUrl,
                    {
                        type: "svg"
                    }
                );

            res.setHeader(
                "Content-Type",
                "image/svg+xml"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename=qr-${id}.svg`
            );

            res.send(svg);
        }
    );
});


app.get("/admin", (req, res) => {

    if (!req.session.user) {
        return res.redirect("/login");
    }

    if (req.session.user.is_admin !== 1) {
        return res.send("Доступ запрещён");
    }

    db.all(
        "SELECT * FROM users",
        [],
        (err, users) => {

            db.all(
                "SELECT * FROM qr_codes",
                [],
                (err, qrCodes) => {

                    db.get(
                        "SELECT COUNT(*) as total FROM visits",
                        [],
                        (err, visits) => {

                            res.render("admin", {
                                users,
                                qrCodes,
                                totalUsers: users.length,
                                totalQr: qrCodes.length,
                                totalVisits: visits.total
                            });

                        }
                    );

                }
            );

        }
    );

});

app.get("/admin/block/:id", (req, res) => {

    db.run(
        `
        UPDATE users
        SET status =
        CASE
            WHEN status='Активен'
            THEN 'Заблокирован'
            ELSE 'Активен'
        END
        WHERE id = ?
        `,
        [req.params.id],
        () => {
            res.redirect("/admin");
        }
    );

});

app.get("/admin/delete-user/:id", (req, res) => {

    db.run(
        "DELETE FROM users WHERE id = ?",
        [req.params.id],
        () => {
            res.redirect("/admin");
        }
    );

});

app.get("/admin/edit-user/:id", (req, res) => {

    db.get(
        "SELECT * FROM users WHERE id = ?",
        [req.params.id],
        (err, user) => {

            res.render("edit-user", {
                user
            });

        }
    );

});

app.post("/admin/edit-user/:id", (req, res) => {

    const { email } = req.body;

    db.run(
        `
        UPDATE users
        SET email = ?
        WHERE id = ?
        `,
        [email, req.params.id],
        () => {

            res.redirect("/admin");

        }
    );

});

app.get("/admin/create-user", (req, res) => {

    res.render("create-user");

});

app.post("/admin/create-user", async (req, res) => {

    const { email, password } = req.body;

    const hash =
        await bcrypt.hash(password, 10);

    db.run(
        `
        INSERT INTO users(
            email,
            password,
            status,
            created_at
        )
        VALUES(?, ?, 'Активен', datetime('now'))
        `,
        [email, hash],
        () => {

            res.redirect("/admin");

        }
    );

});


app.get("/profile", (req, res) => {

if (!req.session.user) {
    return res.redirect("/login");
}

db.get(
    `
    SELECT
        COUNT(*) as totalQr,
        COALESCE(SUM(clicks),0) as totalClicks
    FROM qr_codes
    WHERE user_id = ?
    `,
    [req.session.user.id],
    (err, stats) => {

        res.render("profile", {
            user: req.session.user,
            stats
        });

    }
);

});

app.get("/settings", (req, res) => {

if (!req.session.user) {
    return res.redirect("/login");
}

res.render("settings", {
    user: req.session.user
});


});

app.post("/settings/email", (req, res) => {

const { email } = req.body;

db.run(
    `
    UPDATE users
    SET email = ?
    WHERE id = ?
    `,
    [email, req.session.user.id],
    () => {

        req.session.user.email = email;

        res.redirect("/settings");

    }
);

});

app.post("/settings/password", async (req, res) => {
    
const { password } = req.body;

const hash =
    await bcrypt.hash(password, 10);

db.run(
    `
    UPDATE users
    SET password = ?
    WHERE id = ?
    `,
    [hash, req.session.user.id],
    () => {

        res.redirect("/settings");

    }
);


});


app.listen(3000, () => {
  console.log("Сервер запущен");
});