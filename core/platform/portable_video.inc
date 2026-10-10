// SPDX-License-Identifier: GPL-3.0-or-later
// The original Video::video transition logic calls these host renderer methods.
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
    // GL's original quad vertices are floats. Retain that coordinate precision,
    // then rasterize the same pixel-center coverage in a fixed reference viewport.
    double start=float(current_time-initial_time),end=float(chip->circuit->global_time-initial_time);
    int x0=std::max(0,int(std::ceil(start*WIDTH/scanline_time-0.5)));
    int x1=std::min(int(WIDTH),int(std::ceil(end*WIDTH/scanline_time-0.5)));
    int y0=std::max(0,int(std::ceil(double(v_pos)*HEIGHT/v_size-0.5)));
    int y1=std::min(int(HEIGHT),int(std::ceil(double(v_pos+1)*HEIGHT/v_size-0.5)));
    float* c=&color[(chip->inputs&VIDEO_MASK)*3];
    uint8_t rgb[3];
    for(int channel=0;channel<3;++channel) rgb[channel]=uint8_t(std::lround(std::max(0.0f,std::min(1.0f,c[channel]))*255));
    for(int y=y0;y<y1;++y) for(int x=x0;x<x1;++x) {
        auto pixel=&back[(y*WIDTH+x)*4];
        for(int channel=0;channel<3;++channel) pixel[channel]=rgb[channel];
    }
}
void Video::draw_overlays() {
    // Pong has no overlays; other games are outside the 0.2 compiled target.
}
void Video::swap_buffers() { front=back; }
void Video::show_cursor(bool) {}
