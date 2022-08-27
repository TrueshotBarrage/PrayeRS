const express = require("express");
const fs = require("fs");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// app.set("etag", false);
// app.use(function (req, res, next) {
//   // Delete all headers related to cache
//   req.headers["if-none-match"] = "";
//   req.headers["if-modified-since"] = "";
//   next();
// });

const rideLocations = ["north", "west", "collegetown"];

app.get("/", (req, res) => {
  res.send("Hello World!");
});

function updateAux(isRider, req, res) {
  // Check if the location is valid
  if (rideLocations.includes(userLocation)) {
    // Read the data.json file and parse it into a JSON object
    const rawData = fs.readFileSync("data.json");
    let data = JSON.parse(rawData);

    // If the user is already in the data.json file, update the location;
    // otherwise, add the user & location to the data.json file
    let riderOrDriverArray = isRider ? data.riders : data.drivers;
    const userId = req.body.user_id;
    const riderIds = riderOrDriverArray.map((rider) => rider.id);
    if (userId in riderIds) {
      const index = riderIds.indexOf(userId);
      riderOrDriverArray[index].location = req.body.text;
    } else {
      riderOrDriverArray.push({
        id: userId,
        name: req.body.user_name,
        location: req.body.text,
      });
    }

    // Write the updated data to the data.json file
    const newData = JSON.stringify(data);
    fs.writeFileSync("data.json", newData);

    res.send(`Successfully confirmed: ${user} => ${userLocation}`);
  } else {
    res.send(`Sorry, ${userLocation} is not a valid location.`);
  }
}

app.post("/update/rider", (req, res) => {
  updateAux(true, req, res);
});

app.post("/update/driver", (req, res) => {
  updateAux(false, req, res);
});

app.post("/delete/driver", (req, res) => {
  // Read the data.json file and parse it into a JSON object
  const rawData = fs.readFileSync("data.json");
  let data = JSON.parse(rawData);

  // Delete the driver from the data.json file
  const userId = req.body.user_id;
  const drivers = data.drivers;

  const index = drivers.findIndex((driver) => driver.id === userId);
  if (index === -1) {
    res.send(`Sorry, ${req.body.user_name} is not a valid driver.`);
  } else {
    drivers.splice(index, 1);

    // Write the updated data to the data.json file
    const newData = JSON.stringify(data);
    fs.writeFileSync("data.json", newData);

    res.send(`Successfully deleted: ${req.body.user_name}`);
  }
});

app.post("/reaction", (req, res) => {
  res.send(req.challenge);
});

app.listen(port, () => {
  console.log(`PrayeRS listening on port ${port}`);
});