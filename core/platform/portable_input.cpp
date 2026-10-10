// SPDX-License-Identifier: GPL-3.0-or-later
#include "chips/input.h"
#include "settings.h"
#include <algorithm>
const int Settings::Audio::FREQUENCIES[]={22500,44100,48000,96000};
Settings::Settings():num_mice(0),pause(false),throttle(false),fullscreen(false),audio(),video(),input() {
    audio.frequency=Audio::FREQ_48000;
    audio.volume=500;
    video.keep_aspect=true;
    for(unsigned slot=0;slot<2;++slot) {
        auto& paddle=input.paddle[slot];
        paddle.use_joystick=true;
        paddle.joy_y_axis.joystick=slot;
        paddle.joy_y_axis.axis=1;
        paddle.joystick_mode=Settings::Input::JOYSTICK_ABSOLUTE;
        // Match the full-range absolute axes used by the measured native replay.
        paddle.joystick_sensitivity=0;
    }
    input.coin_start.coin1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Number5);
}
Input::Input():coin(false),axes{0,0}{}
Input::~Input(){}
void Input::poll_input(){}
int Input::getRelativeMouseX(unsigned){return 0;}
int Input::getRelativeMouseY(unsigned){return 0;}
bool Input::getKeyboardState(unsigned key){return key==phoenix::Keyboard::Number5&&coin;}
bool Input::getJoystickButton(unsigned,unsigned){return false;}
int16_t Input::getJoystickAxis(unsigned slot,unsigned axis){return slot<2&&axis==1?axes[slot]:0;}
int Input::getNumJoysticks(){return 2;}
int Input::getNumJoystickAxes(int slot){return slot>=0&&slot<2?2:0;}
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
