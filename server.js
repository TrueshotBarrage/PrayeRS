const app = require("./app").app;

// Fetch the port from the environment variables (config vars on Heroku)
const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`PrayeRS listening on port ${port}`));
