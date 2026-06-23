const int RED_PIN = 11;
const int GREEN_PIN = 10;
const int BLUE_PIN = 9;
const long BAUD_RATE = 9600;

const int BRIGHTNESS_GREEN = 255;
const int BRIGHTNESS_RED = 255;
const int BRIGHTNESS_BLUE = 255;

const unsigned long DISCONNECT_MS = 2500;
const unsigned long BLINK_MS = 1000;

String inputBuffer = "";
unsigned long lastSerialMs = 0;
unsigned long lastBlinkMs = 0;
bool blinkOn = false;
bool hadSerialEver = false;
char currentState = '0';
char lastRenderedState = '\0';
bool lastWasConnected = false;

void setApagado() {
  analogWrite(RED_PIN, 0);
  analogWrite(GREEN_PIN, 0);
  analogWrite(BLUE_PIN, 0);
}

void setVerde() {
  analogWrite(RED_PIN, 0);
  analogWrite(GREEN_PIN, BRIGHTNESS_GREEN);
  analogWrite(BLUE_PIN, 0);
}

void setAzul() {
  analogWrite(RED_PIN, 0);
  analogWrite(GREEN_PIN, 0);
  analogWrite(BLUE_PIN, BRIGHTNESS_BLUE);
}

void setRojo() {
  analogWrite(RED_PIN, BRIGHTNESS_RED);
  analogWrite(GREEN_PIN, 0);
  analogWrite(BLUE_PIN, 0);
}

void applyState(char command) {
  if (command == '0') {
    setVerde();
  } else if (command == '1') {
    setAzul();
  } else if (command == '2') {
    setRojo();
  } else if (command == '3') {
    setApagado();
  }
}

void printOk(const __FlashStringHelper *label) {
  Serial.print(F("OK: "));
  Serial.println(label);
}

void markSerialActivity() {
  lastSerialMs = millis();
  hadSerialEver = true;
}

void setStateFromByte(char command, bool feedback) {
  if (command != '0' && command != '1' && command != '2' && command != '3') {
    return;
  }

  currentState = command;
  markSerialActivity();
  lastRenderedState = '\0';

  if (feedback) {
    if (command == '0') printOk(F("verde"));
    else if (command == '1') printOk(F("azul"));
    else if (command == '2') printOk(F("rojo"));
    else if (command == '3') printOk(F("apagado"));
  }
}

void applyTextCommand(const String &command) {
  if (command == "verde") {
    setStateFromByte('0', true);
  } else if (command == "azul" || command == "amarillo") {
    setStateFromByte('1', true);
  } else if (command == "rojo") {
    setStateFromByte('2', true);
  } else if (command == "apaga") {
    setStateFromByte('3', true);
  } else if (command.length() > 0) {
    Serial.print(F("Comando desconocido: "));
    Serial.println(command);
  }
}

bool isBrowserConnected() {
  if (!hadSerialEver) {
    return false;
  }
  return (millis() - lastSerialMs) < DISCONNECT_MS;
}

void renderConnectedState() {
  if (lastWasConnected && lastRenderedState == currentState) {
    return;
  }

  applyState(currentState);
  lastRenderedState = currentState;
  lastWasConnected = true;
}

void renderDisconnectedBlink() {
  lastWasConnected = false;
  lastRenderedState = '\0';

  unsigned long now = millis();
  if (now - lastBlinkMs < BLINK_MS) {
    return;
  }

  lastBlinkMs = now;
  blinkOn = !blinkOn;

  if (blinkOn) {
    setAzul();
  } else {
    setApagado();
  }
}

void processSerialChar(char incoming) {
  if (incoming == '\n' || incoming == '\r') {
    if (inputBuffer.length() > 0) {
      inputBuffer.toLowerCase();
      applyTextCommand(inputBuffer);
      inputBuffer = "";
    }
    return;
  }

  if (incoming == '0' || incoming == '1' || incoming == '2' || incoming == '3') {
    setStateFromByte(incoming, false);
    inputBuffer = "";
    return;
  }

  if (incoming >= 'A' && incoming <= 'Z') {
    incoming += 32;
  }

  if ((incoming >= 'a' && incoming <= 'z') || incoming == ' ') {
    inputBuffer += incoming;
  }
}

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  Serial.begin(BAUD_RATE);
  Serial.setTimeout(100);
  setApagado();
  Serial.println(F("Listo. Sin navegador: parpadeo azul."));
  Serial.println(F("Monitor Serial: verde, azul, rojo o apaga"));
}

void loop() {
  while (Serial.available() > 0) {
    processSerialChar(Serial.read());
  }

  if (isBrowserConnected()) {
    renderConnectedState();
  } else {
    renderDisconnectedBlink();
  }
}
