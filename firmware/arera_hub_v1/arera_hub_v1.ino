#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include "secrets.h"

static BLEUUID serviceUUID("19b10000-e8f2-537e-4f6c-d104768a1214");
static BLEUUID charUUID("19b10001-e8f2-537e-4f6c-d104768a1214");

BLEAdvertisedDevice* found = nullptr;
BLEClient* client = nullptr;
volatile bool fallPending = false;
volatile uint8_t lastCount = 0;
volatile bool connected = false;

class ScanCB : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice d) {
    if (d.haveServiceUUID() && d.isAdvertisingService(serviceUUID)) {
      BLEDevice::getScan()->stop();
      found = new BLEAdvertisedDevice(d);
    }
  }
};

class ClientCB : public BLEClientCallbacks {
  void onConnect(BLEClient*) {}
  void onDisconnect(BLEClient*) { connected = false; }
};

static void notifyCB(BLERemoteCharacteristic*, uint8_t* data, size_t len, bool) {
  if (len >= 1) { lastCount = data[0]; fallPending = true; }
}

bool connectBrooch() {
  if (!client->connect(found)) return false;
  BLERemoteService* svc = client->getService(serviceUUID);
  if (!svc) { client->disconnect(); return false; }
  BLERemoteCharacteristic* ch = svc->getCharacteristic(charUUID);
  if (!ch || !ch->canNotify()) { client->disconnect(); return false; }
  ch->registerForNotify(notifyCB);
  connected = true;
  return true;
}

void postFall(uint8_t count) {
  WiFiClientSecure tls;
  tls.setInsecure();                       // demo only
  HTTPClient http;
  http.begin(tls, String(SUPABASE_URL) + "/rest/v1/events");
  http.addHeader("apikey", SUPABASE_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");
  String body = String("{\"type\":\"fall\",\"detail\":\"Brooch detected a fall (#") + count + ")\"}";
  int code = http.POST(body);
  Serial.printf("Supabase insert: %d\n", code);
  if (code >= 300 || code < 0) Serial.println(http.getString());
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("ARERA hub starting");

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.print("\nWiFi OK, IP: "); Serial.println(WiFi.localIP());

  BLEDevice::init("ARERA-Hub");
  client = BLEDevice::createClient();
  client->setClientCallbacks(new ClientCB());
  BLEScan* scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCB());
  scan->setActiveScan(true);
}

void loop() {
  if (!connected) {
    if (found) {
      Serial.println("Brooch found, connecting...");
      if (connectBrooch()) Serial.println("Connected to ARERA-Brooch. Listening for falls.");
      else Serial.println("Connect failed, retrying");
      delete found; found = nullptr;
    } else {
      Serial.println("Scanning for brooch...");
      BLEDevice::getScan()->start(5, false);
      BLEDevice::getScan()->clearResults();
    }
  }

  if (fallPending) {
    fallPending = false;
    Serial.printf(">>> FALL from brooch (#%d), sending to ARERA\n", lastCount);
    postFall(lastCount);
  }
  delay(100);
}