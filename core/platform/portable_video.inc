// SPDX-License-Identifier: GPL-3.0-or-later
// The original Video::video transition logic calls these host renderer methods.
namespace {
float reference_window_coordinate(float vertex, float scale, float offset, unsigned extent) {
    // glOrtho stores a GLfloat matrix, and glVertex3f supplies GLfloat vertices.
    // Keep the projection and viewport operations at that same precision.
    float clip=vertex*scale;
    clip+=offset;
    float window=clip*(float(extent)*0.5f);
    window+=float(extent)*0.5f;
    return window;
}
int reference_pixel_boundary(float window) {
    // The pinned original llvmpipe renderer snaps shifted pixel centers to an
    // eight-bit fixed edge grid, rounding ties to even (Mesa 20.0.8
    // lp_rast.h FIXED_ORDER / lp_setup_tri.c calc_fixed_position). Its reported
    // GL_SUBPIXEL_BITS=4 is the generic capability minimum, not this edge grid.
    // Implement nearest-even explicitly so native and Wasm do not depend on a
    // host floating-point rounding mode. Left/top edges include the center;
    // right/bottom edges exclude it through the half-open draw loops below.
    const float units=(window-0.5f)*256.0f;
    double nearest=std::floor(double(units));
    const double fraction=double(units)-nearest;
    if(fraction>0.5 || (fraction==0.5 && std::fmod(nearest,2.0)!=0.0)) ++nearest;
    return int(std::ceil(nearest/256.0));
}
}
void Video::video_init(int, int, const Settings::Video&) { adjust_screen_params(); }
void Video::adjust_screen_params() {
    std::fill(back.begin(),back.end(),0);
    std::fill(front.begin(),front.end(),0);
    for(size_t i=3;i<back.size();i+=4) back[i]=front[i]=255;
    if(desc->monitor_type==COLOR) init_color_lut(desc->r_color);
    else {
        VIDEO_RESISTOR_MATRIX resistors;
        for(int i=0;i<8;++i) for(int c=0;c<3;++c) resistors[i][c]=desc->r[i];
        init_color_lut(resistors);
    }
}
void Video::draw(Chip* chip) {
    if(!scanline_time||!v_size) return;
    if(!(chip->inputs&VIDEO_MASK)&&desc->scan_mode!=INTERLACED) return;
    const float x_scale=float(2.0/double(scanline_time));
    const float y_scale=float(-2.0/double(v_size));
    const float start=reference_window_coordinate(float(current_time-initial_time),x_scale,-1.0f,WIDTH);
    const float end=reference_window_coordinate(float(chip->circuit->global_time-initial_time),x_scale,-1.0f,WIDTH);
    const float top=float(HEIGHT)-reference_window_coordinate(float(v_pos),y_scale,1.0f,HEIGHT);
    const float bottom=float(HEIGHT)-reference_window_coordinate(float(v_pos+1),y_scale,1.0f,HEIGHT);
    int x0=std::max(0,reference_pixel_boundary(start));
    int x1=std::min(int(WIDTH),reference_pixel_boundary(end));
    int y0=std::max(0,reference_pixel_boundary(top));
    int y1=std::min(int(HEIGHT),reference_pixel_boundary(bottom));
    float* c=&color[(chip->inputs&VIDEO_MASK)*3];
    uint8_t rgb[3];
    for(int channel=0;channel<3;++channel) rgb[channel]=uint8_t(std::lround(std::max(0.0f,std::min(1.0f,c[channel]))*255));
    for(int y=y0;y<y1;++y) for(int x=x0;x<x1;++x) {
        auto pixel=&back[(y*WIDTH+x)*4];
        for(int channel=0;channel<3;++channel) pixel[channel]=rgb[channel];
    }
}
void Video::draw_overlays() {
    // None of the three compiled games has an overlay. VideoDesc and original
    // resistor/contrast/timing signals still determine every rendered pixel.
}
void Video::swap_buffers() { front=back; }
void Video::show_cursor(bool) {}
