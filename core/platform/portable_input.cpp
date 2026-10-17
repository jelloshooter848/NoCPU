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
        paddle.joy_x_axis.joystick=slot;
        paddle.joy_x_axis.axis=0;
        paddle.joy_y_axis.joystick=slot;
        paddle.joy_y_axis.axis=1;
        paddle.joystick_mode=Settings::Input::JOYSTICK_ABSOLUTE;
        // Match the full-range absolute axes used by the measured native replay.
        paddle.joystick_sensitivity=0;
    }
    input.coin_start.coin1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Number5);
    input.coin_start.coin2=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Coin2);
    input.coin_start.coin3=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Coin3);
    input.coin_start.coin4=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Coin4);
    input.coin_start.dollar=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Dollar);
    input.coin_start.start1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Number1);
    input.coin_start.start2=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Number2);
    input.buttons[0].button1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Serve);
    input.joystick[0].up=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player1Up);
    input.joystick[0].down=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player1Down);
    input.joystick[1].up=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player2Up);
    input.joystick[1].down=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player2Down);
    // Left/right switches of the four-way joysticks (Gotcha). Released keys
    // read inactive, exactly like the unassigned switches of up/down sticks.
    input.joystick[0].left=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player1Left);
    input.joystick[0].right=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player1Right);
    input.joystick[1].left=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player2Left);
    input.joystick[1].right=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Player2Right);
    input.throttle[0].key=KeyAssignment(KeyAssignment::JOYSTICK_AXIS,1,0);
    input.throttle[0].keyboard_sensitivity=250;
    for(unsigned slot=0;slot<4;++slot) {
        input.wheel[slot].use_keyboard=true;
        input.wheel[slot].keyboard_sensitivity=500;
        input.wheel[slot].left=KeyAssignment(KeyAssignment::JOYSTICK_AXIS,0,slot);
        input.wheel[slot].right=KeyAssignment(KeyAssignment::JOYSTICK_AXIS,1,slot);
        input.buttons[slot].button1=KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,0,slot);
        input.buttons[slot].button2=KeyAssignment(KeyAssignment::JOYSTICK_BUTTON,1,slot);
    }
    // Breakout Serve keeps its established keyboard assignment.
    input.buttons[0].button1=KeyAssignment(KeyAssignment::KEYBOARD,phoenix::Keyboard::Serve);
}
Input::Input():coin(false),start(false),start2(false),serve(false),axes{0,0,0,0},up{false,false},down{false,false},
    left{false,false},right{false,false},
    coin_extra{false,false,false,false},throttle_held(false),buttons{}{}
Input::~Input(){}
void Input::poll_input(){}
int Input::getRelativeMouseX(unsigned){return 0;}
int Input::getRelativeMouseY(unsigned){return 0;}
bool Input::getKeyboardState(unsigned key){
    switch(key) {
    case phoenix::Keyboard::Number5:return coin;
    case phoenix::Keyboard::Number1:return start;
    case phoenix::Keyboard::Number2:return start2;
    case phoenix::Keyboard::Serve:return serve;
    case phoenix::Keyboard::Player1Up:return up[0];
    case phoenix::Keyboard::Player1Down:return down[0];
    case phoenix::Keyboard::Player2Up:return up[1];
    case phoenix::Keyboard::Player2Down:return down[1];
    case phoenix::Keyboard::Player1Left:return left[0];
    case phoenix::Keyboard::Player1Right:return right[0];
    case phoenix::Keyboard::Player2Left:return left[1];
    case phoenix::Keyboard::Player2Right:return right[1];
    case phoenix::Keyboard::Coin2:return coin_extra[0];
    case phoenix::Keyboard::Coin3:return coin_extra[1];
    case phoenix::Keyboard::Coin4:return coin_extra[2];
    case phoenix::Keyboard::Dollar:return coin_extra[3];
    case phoenix::Keyboard::Throttle:return throttle_held;
    default:return false;
    }
}
bool Input::getJoystickButton(unsigned slot,unsigned button){return slot<4&&button<4?buttons[slot][button]:false;}
int16_t Input::getJoystickAxis(unsigned slot,unsigned axis){return slot<4&&axis<2?axes[slot]:0;}
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
