const int RED_PIN = 11;
const int GREEN_PIN = 10;
const int BLUE_PIN = 9;
const long BAUD_RATE = 9600;

String inputBuffer = "";

// Balance amarillo: rojo al máximo, verde ~45% (ajustar 100-140 si hace falta).
const int BRIGHTNESS_GREEN = 255;
const int BRIGHTNESS_RED = 255;
const int BRIGHTNESS_YELLOW_RED = 255;
const int BRIGHTNESS_YELLOW_GREEN = 180;

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

void setAmarillo() {
  analogWrite(RED_PIN, BRIGHTNESS_YELLOW_RED);
  analogWrite(GREEN_PIN, BRIGHTNESS_YELLOW_GREEN);
  analogWrite(BLUE_PIN, 0);
}

void setRojo() {
  analogWrite(RED_PIN, BRIGHTNESS_RED);
  analogWrite(GREEN_PIN, 0);
  analogWrite(BLUE_PIN, 0);
}

void applyByteCommand(char command) {
  if (command == '0') {
    setVerde();
  } else if (command == '1') {
    setAmarillo();
  } else if (command == '2') {
    setRojo();
  } else if (command == '3') {
    setApagado();
  }
}

void applyTextCommand(const String &command) {
  if (command == "verde") {
    setVerde();
  } else if (command == "amarillo") {
    setAmarillo();
  } else if (command == "rojo") {
    setRojo();
  } else if (command == "apaga") {
    setApagado();
  }
}

void setup() {
  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);
  Serial.begin(BAUD_RATE);
  setVerde();
}

void loop() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();

    if (incoming == '\n' || incoming == '\r') {
      if (inputBuffer.length() > 0) {
        inputBuffer.toLowerCase();
        applyTextCommand(inputBuffer);
        inputBuffer = "";
      }
      continue;
    }

    // Bytes sueltos de la extensión Chrome: 0, 1, 2, 3
    if (incoming == '0' || incoming == '1' || incoming == '2' || incoming == '3') {
      applyByteCommand(incoming);
      inputBuffer = "";
      continue;
    }

    if (incoming >= 'A' && incoming <= 'Z') {
      incoming += 32;
    }

    if ((incoming >= 'a' && incoming <= 'z') || incoming == ' ') {
      inputBuffer += incoming;
    }
  }
}
