const express = require("express");
// const fs = require("fs");
const axios = require("axios");
const bodyParser = require("body-parser");

// Create a new express application and expose the port assigned on Heroku
const app = express();
const port = process.env.PORT || 3000;

// Get the correct Content-Type encoding for the body
app.use(bodyParser.urlencoded({ extended: true }));

// Hardcoded for now because I don't care about security in this project
const botToken = "xoxb-934063095335-4012794661457-MXacNp8j2m7edxUjU2RUoeSe";

// Set this to true if production-ready instead of debugging
const prod = true;

// Slack channel IDs in the Emmaus Road workspace
let publishedChannel;
let dataBinURL;
if (prod) {
  publishedChannel = "CTEJU34FN"; // #prayermeeting
  dataBinURL = "https://api.jsonbin.io/v3/b/630a88c75c146d63ca823917"; // data.json
} else {
  publishedChannel = "C040PS45KBJ"; // #bot-test
  dataBinURL = "https://api.jsonbin.io/v3/b/630bcdd7e13e6063dc9009be"; // example_data.json
}

// Valid ride locations
const rideLocations = ["north", "west", "collegetown"];

// Test (default) route
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Deprecated; Heroku's filesystem is ephermeral so this won't do
// function readData() {
//   const rawData = fs.readFileSync("data.json");
//   return JSON.parse(rawData);
// }

// function writeData(data) {
//   const newData = JSON.stringify(data);
//   fs.writeFileSync("data.json", newData);
// }

// Read the data.json file on jsonbin.io
async function readData() {
  config = {
    headers: {
      "X-Master-Key":
        "$2b$10$r0521y/gY6h7m8iPZprhf.URBBG3nnCyIeNuaLPlUvlFpboTi8BjG",
    },
  };

  console.log(dataBinURL);

  return await axios
    .get(dataBinURL, config)
    .then((response) => {
      return response.data.record;
    })
    .catch((error) => {
      console.log(error);
    });
}

// Write to the data.json file on jsonbin.io
function writeData(data) {
  const newData = JSON.stringify(data);

  config = {
    headers: {
      "X-Master-Key":
        "$2b$10$r0521y/gY6h7m8iPZprhf.URBBG3nnCyIeNuaLPlUvlFpboTi8BjG",
      "Content-Type": "application/json",
    },
  };
  axios.put(dataBinURL, newData, config);
}

// Fetch and parse the user's public name on Slack; use display name if available
function readUsername(userId) {
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
    params: {
      user: userId,
    },
  };

  const promise = axios.get("https://slack.com/api/users.info", config);
  return promise.then((response) => {
    const profile = response.data.user.profile;
    if (profile.display_name) {
      return profile.display_name;
    } else {
      return profile.real_name;
    }
  });
}

// Auxilliary function to update rider or driver info in the data.json file
async function updateAux(isRider, req, res) {
  console.log(req);
  const text = req.body.text.toLowerCase().split(" ");
  const location = text[0];
  if (!isRider) {
    var maxPassengers = parseInt(text[1]);
  }

  // Check if the location is valid
  if (rideLocations.includes(location)) {
    // Read the data.json file and parse it into a JSON object
    let data = await readData();

    // If the user is already in the data.json file, update the location;
    // otherwise, add the user & location to the data.json file
    let riderOrDriverArray = isRider ? data.riders : data.drivers;

    const userId = req.body.user_id;
    readUsername(userId).then((username) => {
      const userName = username;

      // Find the rider or driver in the array
      const riderIds = riderOrDriverArray.map((rider) => rider.id);

      // If the rider/driver is already in the array, update the location
      if (riderIds.includes(userId)) {
        const index = riderIds.indexOf(userId);
        riderOrDriverArray[index].location = location;
        if (!isRider) {
          riderOrDriverArray[index].maxPassengers = maxPassengers;
        }
      } else {
        // Otherwise, add the rider/driver to the array
        riderOrDriverArray.push({
          id: userId,
          name: userName,
          location,
          ...(!isRider && { maxPassengers }),
        });
      }

      // Write the updated data to the data.json file
      writeData(data);
      console.log(data);

      if (isRider) {
        res.send(`Successfully updated rider ${userName} to ${location}.`);
      } else {
        res.send(
          `Successfully updated driver ${userName} to ${location} with ${maxPassengers} max passengers.`
        );
      }
    });
  } else {
    res.send(`Sorry, ${req.body.text} is not a valid location.`);
  }
}

// Update or create the rider in the data.json file
app.post("/update/rider", async (req, res) => {
  await updateAux(true, req, res);
});

// Update or create the driver in the data.json file
app.post("/update/driver", async (req, res) => {
  await updateAux(false, req, res);
});

// Delete the rider from the data.json file
app.post("/delete/driver", async (req, res) => {
  // Read the data.json file and parse it into a JSON object
  let data = await readData();

  // Delete the driver from the data.json file
  const userId = req.body.user_id;
  const drivers = data.drivers;

  const index = drivers.findIndex((driver) => driver.id === userId);
  if (index === -1) {
    res.send(`Sorry, ${req.body.user_name} is not a valid driver.`);
  } else {
    drivers.splice(index, 1);

    // Write the updated data to the data.json file
    writeData(data);

    res.send(`Successfully deleted: ${req.body.user_name}`);
  }
});

// Fetch the latest version of the data.json file from the server
app.get("/latest_data", async (req, res) => {
  const data = await readData();
  res.send(data);
});

// Shuffle an array
function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

// Generate driver-rider assignments
app.post("/generate_assignments", async (req, res) => {
  let data = await readData();

  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
    params: {
      channel: publishedChannel,
      timestamp: data.ts,
    },
  };

  axios
    .get("https://slack.com/api/reactions.get", config)
    .then((response) => {
      const rxns = response.data.message?.reactions;
      if (!rxns) {
        res.send("No one reacted to the message.");
      } else {
        if (prod) {
          var usersWhoReacted = rxns.map((rxn) => rxn.users).flat();
          var usersWhoReactedUniq = [...new Set(usersWhoReacted)];
        } else {
          var usersWhoReactedUniq = [
            "a",
            "b",
            "c",
            "d",
            "e",
            "f",
            "g",
            "h",
            "i",
            "j",
            "k",
            "l",
          ];
        }

        // Initialize the data structures
        let driverRiderMap = {};
        let driverRiderMap2 = {};
        let ridersWithoutDriver = [];
        let ridersWithoutDriver2 = [];
        let availableDrivers = [];
        for (const driver of data.drivers) {
          if (usersWhoReactedUniq.includes(driver.id)) {
            driverRiderMap[driver.name] = [];
            driverRiderMap2[driver.name] = [];
            availableDrivers.push(driver);
          }
        }
        let noIdealAssignmentExists = false;
        let noOptimalAssignmentExists = false;

        // Assign riders to drivers - try to match riders' preferred locations
        for (const userId of usersWhoReactedUniq) {
          // Introduce randomness to the assignment process
          shuffle(data.drivers);

          // Find the rider info from the list of users who reacted to the post
          const rider = data.riders.find((rdr) => rdr.id === userId);
          if (rider) {
            // Match the rider to a driver based on capacity and location
            const driver = availableDrivers.find(
              (drv) =>
                drv.location === rider.location &&
                drv.maxPassengers - driverRiderMap[drv.name].length > 0
            );
            // Possible driver was found
            if (driver) {
              driverRiderMap[driver.name].push(rider.name);
            } else {
              // No driver possible
              ridersWithoutDriver.push(rider.name);
              console.log(`No driver found for ${rider.name}`);
            }
          }
        }

        // Redo the assignment process if there are any riders without a driver
        if (ridersWithoutDriver.length > 0) {
          // Try a non-ideal, but still optimal (possible), assignment
          console.log("!!!!!Redoing the assignment process...!!!!!!!");
          noIdealAssignmentExists = true;

          // Sort the riders by their preferred location
          data.riders.sort((a, b) => {
            a.location > b.location ? 1 : -1;
          });

          // Same process as above, but with a twist
          for (const userId of usersWhoReactedUniq) {
            const rider = data.riders.find((rdr) => rdr.id === userId);
            if (rider) {
              const driver = availableDrivers.find(
                (drv) =>
                  drv.location === rider.location &&
                  drv.maxPassengers - driverRiderMap2[drv.name].length > 0
              );
              if (driver) {
                driverRiderMap2[driver.name].push(rider.name);
              } else {
                // The twist: find a driver with capacity, but don't care about location
                const driverForAnotherLocation = availableDrivers.find(
                  (drv) =>
                    drv.maxPassengers - driverRiderMap2[drv.name].length > 0
                );
                if (driverForAnotherLocation) {
                  // Display the new location so the driver knows
                  const displayedLoc = (string) =>
                    string.charAt(0).toUpperCase() + string.slice(1);
                  driverRiderMap2[driverForAnotherLocation.name].push(
                    `${rider.name} (${displayedLoc(rider.location)})`
                  );
                } else {
                  // We're out of luck - not possible to assign this rider
                  ridersWithoutDriver2.push(rider.name);
                  console.log(`No driver found for ${rider.name}`);
                  noOptimalAssignmentExists = true;
                }
              }
            }
          }
        }

        // Display the results in string format
        let assignments2;
        let assignments2Str = "";
        if (noOptimalAssignmentExists) {
          // Send both assignments as options
          assignments2 = Object.entries(driverRiderMap2).map(
            ([driver, riders]) => {
              return `${driver} => ${riders.join(", ")}`;
            }
          );
          assignments2Str = `${assignments2.join(
            "\n"
          )}\n\nUnassigned riders:\n${ridersWithoutDriver2.join("\n")}`;
        }

        const assignments = Object.entries(
          noIdealAssignmentExists && !noOptimalAssignmentExists
            ? driverRiderMap2
            : driverRiderMap
        ).map(([driver, riders]) => {
          return `${driver} => ${riders.join(", ")}`;
        });
        const assignmentsStr = `${
          noOptimalAssignmentExists
            ? "There's no way to generate an optimal assignment of drivers to riders. I generated two possibilities though, feel free to modify as needed and post manually.\nOption 1:\n"
            : ""
        }${assignments.join("\n")}\n\nUnassigned riders:\n${
          noIdealAssignmentExists && !noOptimalAssignmentExists
            ? ridersWithoutDriver2
            : ridersWithoutDriver.join("\n")
        }${
          noOptimalAssignmentExists ? "\n\nOption 2:\n" : ""
        }${assignments2Str}`;

        // Send the assignments to the user but without posting publicly
        if (noOptimalAssignmentExists) {
          res.send(assignmentsStr);
        } else {
          res.send("Successfully generated assignments!");
          // Write the message to the Slack channel
          const config = {
            headers: { Authorization: `Bearer ${botToken}` },
          };
          const message = {
            channel: publishedChannel,
            text: assignmentsStr,
          };
          axios.post("https://slack.com/api/chat.postMessage", message, config);
        }
      }
    })
    .catch((error) => {
      console.log(error);
    });
});

// Slack Events API handler
app.post("/events", async (req, res) => {
  res.send(req.body.challenge);
  res.end();

  // Looks like I don't need to use the Events API because I can just
  // read all the reactions on the target message at a specific time.
  // Will leave this here for now.
  // switch (req.body.type) {
  //   case "reaction_added":
  //     let data = await readData();
  //     if (data.ts === req.body.event_ts) {
  //       ...
  //     }
  // }
});

// Send a message to the #bot-test channel (C040PS45KBJ)
app.get("/send/test/:text", (req, res) => {
  const message = {
    channel: "C040PS45KBJ",
    text: req.params.text,
  };
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
  };

  axios.post("https://slack.com/api/chat.postMessage", message, config).then(
    (messageRes) => {
      res.send(messageRes.data.ts);
    },
    (error) => {
      res.send(error);
    }
  );
});

// Send the daily reminder announcement to the Slack channel
async function sendDailyReminderMessage(req, res) {
  // Compute tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow
    .toLocaleDateString()
    .split("/")
    .slice(0, 2)
    .join("/");

  const message = {
    channel: publishedChannel,
    text: `<!channel> If you would like a ride to EMP tmrw (${tomorrowStr}), please react to this message :) beep boop`,
  };
  const config = {
    headers: { Authorization: `Bearer ${botToken}` },
  };

  axios.post("https://slack.com/api/chat.postMessage", message, config).then(
    async (messageRes) => {
      res.send(messageRes.data.ts);
      console.log(messageRes.data.ts);

      let data = await readData();
      data.ts = messageRes.data.ts;
      writeData(data);
      console.log(data);
    },
    (error) => {
      res.send(error);
    }
  );
}

// Send a message to the #prayermeeting channel (CTEJU34FN)
app.get("/send/daily", async (req, res) => {
  await sendDailyReminderMessage(req, res);
});

// POST version is used for the slash command on Slack
app.post("/send/daily", async (req, res) => {
  await sendDailyReminderMessage(req, res);
});

app.listen(port, () => {
  console.log(`PrayeRS listening on port ${port}`);
});
