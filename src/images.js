// Background images, one entry per slot. This is the only place to change when you have artwork.
//
// To replace a placeholder:
//   1. Put the image in `public/images/` (for example `public/images/menu.jpg`).
//   2. Set the slot below to its path: menu: '/images/menu.jpg'
//      (or { src: '/images/menu.jpg', position: 'left top' } to choose which part stays visible when it is cropped).
//
// null keeps the grey placeholder. A path that fails to load falls back to the placeholder too.
//
// Slots are drawn by <ImageSlot name="..."> (src/components/ImageSlot.jsx):
//   menu             main menu, full-screen background
//   action           "What to do with these data?" page: ONE full-screen picture that shows through the
//                    three grey shapes (left, top-right, right edge)
//   confirm-side     right panel of the delete dialog
export const IMAGES = {
  menu: "/images/cyberpunk.jfif",
  action: "/images/cyberpunk.jfif",
  "confirm-side": null,
};
