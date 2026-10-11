// SPDX-License-Identifier: GPL-3.0-or-later
// Portable subset of DICE settings fields read by the preserved input circuitry.
#ifndef SETTINGS_H
#define SETTINGS_H
#include <stdint.h>
#include <stddef.h>
namespace phoenix { struct Keyboard { enum Scancode {
    None=0, Number5=1, Number1=2, Player1Up=3, Player1Down=4, Player2Up=5, Player2Down=6
}; }; }
struct KeyAssignment {
    enum InputType { NONE=0, KEYBOARD, JOYSTICK_AXIS, JOYSTICK_BUTTON };
    unsigned type, button, joystick;
    KeyAssignment(unsigned t=NONE, unsigned b=0, unsigned j=0):type(t),button(b),joystick(j){}
};
struct Settings {
    unsigned num_mice;
    bool pause, throttle, fullscreen;
    struct Audio {
        enum Frequency { FREQ_22500=0, FREQ_44100, FREQ_48000, FREQ_96000 };
        static const int FREQUENCIES[];
        unsigned frequency, volume;
        bool mute;
    } audio;
    struct Video {
        unsigned multisampling, brightness, contrast;
        bool keep_aspect, vsync, status_visible;
    } video;
    struct Input {
        struct MouseAxis { unsigned mouse, axis; };
        struct JoystickAxis { unsigned joystick, axis; };
        enum JoystickMode { JOYSTICK_RELATIVE=0, JOYSTICK_ABSOLUTE=1 };
        struct Paddle {
            bool use_mouse;
            MouseAxis x_axis,y_axis;
            unsigned mouse_sensitivity;
            bool use_keyboard;
            unsigned keyboard_sensitivity;
            KeyAssignment up,down,left,right;
            bool use_joystick;
            JoystickAxis joy_x_axis,joy_y_axis;
            unsigned joystick_mode,joystick_sensitivity;
        } paddle[4];
        struct Wheel {
            bool use_mouse;
            MouseAxis axis;
            unsigned mouse_sensitivity;
            bool use_keyboard;
            unsigned keyboard_sensitivity;
            KeyAssignment left,right;
        } wheel[4];
        struct Throttle { KeyAssignment key; unsigned keyboard_sensitivity; } throttle[1];
        struct Joystick { KeyAssignment up,down,left,right; } joystick[2];
        struct Button { KeyAssignment button1,button2,button3; } buttons[6];
        struct CoinStart { KeyAssignment coin1,coin2,coin3,coin4,dollar,start1,start2; } coin_start;
    } input;
    Settings();
    template<size_t N> const Input::Joystick& joystick() const { return input.joystick[N]; }
    template<size_t N> const Input::Button& buttons() const { return input.buttons[N]; }
    const Input::CoinStart& coinStart() const { return input.coin_start; }
};
#endif
