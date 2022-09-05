const modules = require("../app");
const request = require("supertest");

const app = modules.app;

const testBinURL = "https://api.jsonbin.io/v3/b/630bcdd7e13e6063dc9009be";

describe("GET /", () => {
  it("responds with 200", async () => {
    await request(app).get("/").expect(200);
  });
});

describe("test readData", () => {
  it("drivers is not null", async () => {
    await modules.readData(testBinURL).then((response) => {
      expect(Array.isArray(response.drivers)).toBeTruthy();
    });
  });
  it("riders is not null", async () => {
    await modules.readData(testBinURL).then((response) => {
      expect(Array.isArray(response.riders)).toBeTruthy();
    });
  });
  it("timestamp (ts) is equal to hardcoded value", async () => {
    await modules.readData(testBinURL).then((response) => {
      expect(response.ts).toEqual("1661880294.106969");
    });
  });
});

describe("test readSecrets", () => {
  response = modules.readSecrets();
  it("botToken is not null", async () => {
    expect(response.botToken).toBeTruthy();
  });
  it("masterKey is not null", async () => {
    expect(response.masterKey).toBeTruthy();
  });
});

describe("test writeData", () => {
  it("returns 200 with correct data", async () => {
    const data = await modules.readData(testBinURL);
    const response = await modules.writeData(data, testBinURL);

    expect(response.status).toEqual(200);
    expect(response.data.record).toEqual(data);
  });
});
