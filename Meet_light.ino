const int RED_PIN = 11;
const int GREEN_PIN = 10;
const int BLUE_PIN = 9;
const long BAUD_RATE = 9600;

const int BRIGHTNESS_GREEN = 255;
const int BRIGHTNESS_RED = 255;
const int BRIGHTNESS_BLUE = 255;

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

void printOk(const __FlashStringHelper *label) {
  Serial.print(F("OK: "));
  Serial.println(label);
}

void applyByteCommand(char command) {
  if (command == '0') {
    setVerde();
    printOk(F("verde"));
  } else if (command == '1') {
    setAzul();
    printOk(F("azul"));
  } else if (command == '2') {
    setRojo();
    printOk(F("rojo"));
  } else if (command == '3') {
    setApagado();
    printOk(F("apagado"));
  }
}

void applyTextCommand(const String &command) {
  if (command == "verde") {
    setVerde();
    printOk(F("verde"));
  } else if (command == "azul" || command == "amarillo") {
    setAzul();
    printOk(F("azul"));
  } else if (command == "rojo") {
    setRojo();
    printOk(F("rojo"));
  } else if (command == "apaga") {
    setApagado();
    printOk(F("apagado"));
  } else if (command.length() > 0) {
    Serial.print(F("Comando desconocido: "));
    Serial.println(command);
  }
}

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  Serial.begin(BAUD_RATE);
  Serial.setTimeout(100);
  setVerde();
  Serial.println(F("Listo. Escribe: verde, azul, rojo o apaga"));
}

void loop() {
  if (Serial.available() == 0) {
    return;
  }

  String input = Serial.readStringUntil('\n');
  input.trim();
  input.toLowerCase();

  if (input.length() == 0) {
    return;
  }

  if (input.length() == 1) {
    applyByteCommand(input.charAt(0));
    return;
  }

  applyTextCommand(input);
}
