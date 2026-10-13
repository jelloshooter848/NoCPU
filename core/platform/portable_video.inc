// SPDX-License-Identifier: GPL-3.0-or-later
// The original Video::video transition logic calls these host renderer methods.
namespace {
float reference_window_coordinate(float vertex, float scale, float offset, float viewport_scale, float translate) {
    // glOrtho stores a GLfloat matrix, and glVertex3f supplies GLfloat vertices.
    // Keep the projection at that same precision (an axis-aligned projection
    // row has one nonzero product, so fusing it changes nothing).
    float clip=vertex*scale;
    clip+=offset;
    // llvmpipe's draw module applies the viewport as llvm.fmuladd (Mesa 20.0.8
    // draw_llvm.c generate_viewport), which the pinned reference host executes
    // as one fused multiply-add. std::fma gives that single rounding in both
    // native and Wasm instead of depending on compiler contraction.
    return std::fma(clip,viewport_scale,translate);
}
int64_t reference_fixed_edge(float window) {
    // The pinned original llvmpipe renderer snaps shifted pixel centers to an
    // eight-bit fixed edge grid, rounding ties to even (Mesa 20.0.8
    // lp_rast.h FIXED_ORDER / lp_setup_tri.c calc_fixed_position). Its reported
    // GL_SUBPIXEL_BITS=4 is the generic capability minimum, not this edge grid.
    // Implement nearest-even explicitly so native and Wasm do not depend on a
    // host floating-point rounding mode.
    const float units=(window-0.5f)*256.0f;
    double nearest=std::floor(double(units));
    const double fraction=double(units)-nearest;
    if(fraction>0.5 || (fraction==0.5 && std::fmod(nearest,2.0)!=0.0)) ++nearest;
    return int64_t(nearest);
}
int64_t reference_floor_pixel(int64_t fixed) { return fixed>=0?fixed/256:-((255-fixed)/256); }
int64_t reference_ceil_pixel(int64_t fixed) { return -reference_floor_pixel(-fixed); }
struct ReferenceVertex { int64_t x,y; };
int64_t reference_edge(ReferenceVertex a,ReferenceVertex b,ReferenceVertex p) {
    return (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
}
bool reference_in_triangle(ReferenceVertex a,ReferenceVertex b,ReferenceVertex c,ReferenceVertex p) {
    const int64_t area=reference_edge(a,b,c);
    if(!area)return false;
    if(area<0)std::swap(b,c);
    const ReferenceVertex vertices[]={a,b,c,a};
    for(unsigned i=0;i<3;++i) {
        const ReferenceVertex start=vertices[i],end=vertices[i+1];
        const int64_t edge=reference_edge(start,end,p);
        // Mesa flips a default window to Y_0_TOP and selects bottom_edge_rule.
        // In these upward GL coordinates, lp_setup_tri's adjusted planes include
        // left and lower edges; upper and right edges exclude a tied center.
        const bool inclusive=end.y<start.y||(end.y==start.y&&end.x>start.x);
        if(edge<0||(edge==0&&!inclusive))return false;
    }
    return true;
}
uint8_t reference_color_byte(float value) {
    return uint8_t(std::lround(std::max(0.0f,std::min(1.0f,value))*255));
}
}
void Video::video_init(int width,int height,const Settings::Video& settings) {
    unsigned x=0,y=0;
    const bool horizontal=desc->orientation!=ROTATE_90&&desc->orientation!=ROTATE_270;
    // Original Video::video_init aspect/crop arithmetic, before rasterization.
    if(settings.keep_aspect&&horizontal) {
        if(width>4*height/3) {x=(width-4*height/3)/2;width=4*height/3;}
        else if(height>3*width/4) {y=(height-3*width/4)/2;height=3*width/4;}
    } else if(settings.keep_aspect) {
        if(width>3*height/4) {x=(width-3*height/4)/2;width=3*height/4;}
        else if(height>4*width/3) {y=(height-4*width/3)/2;height=4*width/3;}
    }
    viewport_x=x;viewport_y=y;
    pixels_width=unsigned(width);pixels_height=unsigned(height);
    back.assign(size_t(pixels_width)*pixels_height*4,0);
    front.assign(back.size(),0);
    adjust_screen_params();
}
void Video::adjust_screen_params() {
    std::fill(back.begin(),back.end(),0);
    std::fill(front.begin(),front.end(),0);
    for(size_t i=3;i<back.size();i+=4) back[i]=front[i]=255;
    // Original glRotatef rotates the projection before glOrtho. Retain GLfloat
    // trigonometry and matrix operations, including the small cosine at90deg.
    float degrees=0;
    switch(desc->orientation) {
        case ROTATE_90:degrees=90;break;
        case ROTATE_180:degrees=180;break;
        case ROTATE_270:degrees=270;break;
        default:break;
    }
    const float radians=float(double(degrees)*0.01745329251994329576923690768489);
    const float cosine=std::cos(radians),sine=std::sin(radians);
    // A zero-span original glOrtho is rejected and leaves the rotation matrix.
    const bool ortho=scanline_time&&v_size;
    const float xs=ortho?float(2.0/double(scanline_time)):1.0f;
    const float ys=ortho?float(-2.0/double(v_size)):1.0f;
    projection[0]=cosine*xs;projection[1]=sine*ys;
    projection[2]=-sine*xs;projection[3]=cosine*ys;
    projection[4]=ortho?-cosine+sine:0.0f;
    projection[5]=ortho?sine+cosine:0.0f;
    if(desc->monitor_type==COLOR) init_color_lut(desc->r_color);
    else {
        VIDEO_RESISTOR_MATRIX resistors;
        for(int i=0;i<8;++i) for(int c=0;c<3;++c) resistors[i][c]=desc->r[i];
        init_color_lut(resistors);
    }
}
void Video::draw_quad(float x0,float y0,float x1,float y1,const uint8_t rgb[3],bool blend) {
    // The cold original zero-span glOrtho leaves a rotation matrix, but screen
    // adjustment has just cleared RGB to black. Multiplicative overlays cannot
    // change that black frame; avoid projecting huge time vertices through the
    // rejected zero-span matrix before the first measured scanline exists.
    if(!scanline_time||!v_size)return;
    const float coordinates[4][2]={{x0,y0},{x1,y0},{x1,y1},{x0,y1}};
    ReferenceVertex vertices[4];
    for(unsigned i=0;i<4;++i) {
        float clip_x=projection[0]*coordinates[i][0];
        clip_x+=projection[1]*coordinates[i][1];clip_x+=projection[4];
        float clip_y=projection[2]*coordinates[i][0];
        clip_y+=projection[3]*coordinates[i][1];clip_y+=projection[5];
        float window_x=clip_x*(float(pixels_width)*0.5f);
        window_x+=float(viewport_x)+float(pixels_width)*0.5f;
        float window_y=clip_y*(float(pixels_height)*0.5f);
        window_y+=float(viewport_y)+float(pixels_height)*0.5f;
        // Mesa snaps absolute GL window coordinates; crop only after coverage.
        vertices[i]={reference_fixed_edge(window_x),reference_fixed_edge(window_y)};
    }
    int64_t min_x=vertices[0].x,max_x=min_x,min_y=vertices[0].y,max_y=min_y;
    for(unsigned i=1;i<4;++i) {
        min_x=std::min(min_x,vertices[i].x);max_x=std::max(max_x,vertices[i].x);
        min_y=std::min(min_y,vertices[i].y);max_y=std::max(max_y,vertices[i].y);
    }
    const int x0_pixel=std::max(0,int(std::ceil(double(min_x)/256))-int(viewport_x));
    const int x1_pixel=std::min(int(pixels_width),int(std::floor(double(max_x)/256))+1-int(viewport_x));
    const int y0_pixel=std::max(0,int(viewport_y+pixels_height)-int(std::floor(double(max_y)/256))-1);
    const int y1_pixel=std::min(int(pixels_height),int(viewport_y+pixels_height)-int(std::ceil(double(min_y)/256)));
    for(int y=y0_pixel;y<y1_pixel;++y)for(int x=x0_pixel;x<x1_pixel;++x) {
        const ReferenceVertex center={int64_t(x+viewport_x)*256,
            int64_t(viewport_y+pixels_height-1-y)*256};
        if(!reference_in_triangle(vertices[0],vertices[1],vertices[2],center)
           &&!reference_in_triangle(vertices[0],vertices[2],vertices[3],center))continue;
        uint8_t* pixel=&back[(size_t(y)*pixels_width+x)*4];
        for(unsigned channel=0;channel<3;++channel) {
            // GL_ZERO/GL_SRC_COLOR multiplies framebuffer UNORM8 values by the
            // quantized source color; round the resulting UNORM8 product.
            pixel[channel]=blend?uint8_t((unsigned(pixel[channel])*rgb[channel]+127)/255):rgb[channel];
        }
    }
}
void Video::draw(Chip* chip) {
    if(!scanline_time||!v_size) return;
    if(!(chip->inputs&VIDEO_MASK)&&desc->scan_mode!=INTERLACED) return;
    if(desc->orientation!=ROTATE_0) {
        const float* c=&color[(chip->inputs&VIDEO_MASK)*3];
        const uint8_t rgb[]={reference_color_byte(c[0]),reference_color_byte(c[1]),reference_color_byte(c[2])};
        draw_quad(float(current_time-initial_time),float(v_pos),
            float(chip->circuit->global_time-initial_time),float(v_pos+1),rgb,false);
        return;
    }
    const float x_scale=float(2.0/double(scanline_time));
    const float y_scale=float(-2.0/double(v_size));
    // Mesa snaps absolute window coordinates of the original 632x432 client
    // window, whose keep-aspect viewport is offset (crop only after snapping).
    // That window is cropped symmetrically, so its height is 2*y+height.
    const float half_width=float(pixels_width)*0.5f,half_height=float(pixels_height)*0.5f;
    const float window_height=float(2*viewport_y+pixels_height);
    const int64_t start=reference_fixed_edge(reference_window_coordinate(
        float(current_time-initial_time),x_scale,-1.0f,half_width,float(viewport_x)+half_width));
    const int64_t end=reference_fixed_edge(reference_window_coordinate(
        float(chip->circuit->global_time-initial_time),x_scale,-1.0f,half_width,float(viewport_x)+half_width));
    // A window-system framebuffer is Y_0_TOP: Mesa's state tracker negates the
    // viewport y scale and translates by fb_height-(y+height/2) (Mesa 20.0.8
    // st_atom_viewport.c), so llvmpipe snaps the downward window y directly;
    // flipping an upward coordinate afterwards rounds differently. It also
    // selects bottom_edge_rule for that orientation (st_atom_rasterizer.c,
    // lp_setup_tri.c): a pixel center exactly on a horizontal edge belongs to
    // the scanline above it (bottom edge inclusive, top edge exclusive). Left
    // edges include a tied center and right edges exclude it.
    const float translate_y=window_height-(float(viewport_y)+half_height);
    const int64_t top=reference_fixed_edge(reference_window_coordinate(
        float(v_pos),y_scale,1.0f,-half_height,translate_y));
    const int64_t bottom=reference_fixed_edge(reference_window_coordinate(
        float(v_pos+1),y_scale,1.0f,-half_height,translate_y));
    const int x0=int(std::max<int64_t>(0,reference_ceil_pixel(start)-viewport_x));
    const int x1=int(std::min<int64_t>(WIDTH,reference_ceil_pixel(end)-viewport_x));
    const int y0=int(std::max<int64_t>(0,reference_floor_pixel(top)+1-viewport_y));
    const int y1=int(std::min<int64_t>(HEIGHT,reference_floor_pixel(bottom)+1-viewport_y));
    float* c=&color[(chip->inputs&VIDEO_MASK)*3];
    uint8_t rgb[3];
    for(int channel=0;channel<3;++channel) rgb[channel]=uint8_t(std::lround(std::max(0.0f,std::min(1.0f,c[channel]))*255));
    for(int y=y0;y<y1;++y) for(int x=x0;x<x1;++x) {
        auto pixel=&back[(y*WIDTH+x)*4];
        for(int channel=0;channel<3;++channel) pixel[channel]=rgb[channel];
    }
}
void Video::draw_overlays() {
    for(const VideoOverlay& overlay:desc->overlays) {
        const double end_x=overlay.width<0?scanline_time:(overlay.x+overlay.width)/Circuit::timescale;
        const double end_y=overlay.height<0?v_size:overlay.y+overlay.height;
        const uint8_t rgb[]={reference_color_byte(float(overlay.r)),reference_color_byte(float(overlay.g)),
            reference_color_byte(float(overlay.b))};
        draw_quad(float(overlay.x/Circuit::timescale),float(overlay.y),float(end_x),float(end_y),rgb,true);
    }
}
void Video::swap_buffers() { front=back; }
void Video::show_cursor(bool) {}
