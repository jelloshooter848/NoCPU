// SPDX-License-Identifier: GPL-3.0-or-later
#include "chips/input.h"
#include "settings.h"
#include <algorithm>
const int Settings::Audio::FREQUENCIES[]={22500,44100,48000,96000};
Settings::Settings():num_mice(0),pause(false),throttle(false),fullscreen(false),audio(),video(),input() {
    audio.frequency=Audio::FREQ_48000;
    audio.volume=500;
    video.keep_aspect=true;
    for(unsigned slot=0;slot<4;++slot) {
        auto& paddle=input.paddle[slot];
        paddle.use_joystick=true;
        paddle.joy_y_axis.joystick=slot;
        paddle.joy_y_axis.axis=1;
        paddle.joystick_mode=Settings::Input::JOYSTICK_ABSOLUTE;
        // Match the full-range absolute axes used by the measured native replay.
        paddle.joystick_sensitivity=0;
    }
    input.coin_start.coin1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Number5);
    input.coin_start.start1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Number1);
    input.joystick[0].up=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player1Up);
    input.joystick[0].down=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player1Down);
    input.joystick[1].up=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player2Up);
    input.joystick[1].down=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player2Down);
}
Input::Input():coin(false),start(false),axes{0,0,0,0},up{false,false},down{false,false}{}
Input::~Input(){}
void Input::poll_input(){}
int Input::getRelativeMouseX(unsigned){return 0;}
int Input::getRelativeMouseY(unsigned){return 0;}
bool Input::getKeyboardState(unsigned key){
    switch(key) {
    case phoenix::Keyboard::Number5:return coin;
    case phoenix::Keyboard::Number1:return start;
    case phoenix::Keyboard::Player1Up:return up[0];
    case phoenix::Keyboard::Player1Down:return down[0];
    case phoenix::Keyboard::Player2Up:return up[1];
    case phoenix::Keyboard::Player2Down:return down[1];
    default:return false;
    }
}
bool Input::getJoystickButton(unsigned,unsigned){return false;}
int16_t Input::getJoystickAxis(unsigned slot,unsigned axis){return slot<4&&axis==1?axes[slot]:0;}
int Input::getNumJoysticks(){return 4;}
int Input::getNumJoystickAxes(int slot){return slot>=0&&slot<4?2:0;}
bool Input::getKeyPressed(const KeyAssignment& key) {
    switch(key.type) {
    case KeyAssignment::KEYBOARD:return getKeyboardState(key.button);
    case KeyAssignment::JOYSTICK_BUTTON:return getJoystickButton(key.joystick,key.button);
    case KeyAssignment::JOYSTICK_AXIS: {
        int16_t value=getJoystickAxis(key.joystick,key.button>>1);
        return (key.button&1)?value>Joystick::BUTTON_THRESHOLD:value<-Joystick::BUTTON_THRESHOLD;
    }
    default:return false;
    }
}
