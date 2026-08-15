# Meeting File Input Spacing Design

## Goal

Create visible vertical space between the top border of the meeting-file input and its native file-selection button while preserving the current full-width form layout.

## Selected Design

Target the existing meeting upload input with `.meeting-field > input[type='file']`. Give the scoped input a 44px height and 5px vertical padding, retain its inherited full width, and size the native `::file-selector-button` to 28px with no top margin. The button then sits vertically centered with a 5px gap to the input border.

No file handling, accepted MIME types, or other form-field spacing changes. The upload input remains full width.

## Verification

Update the meeting layout test to assert the class binding, full-width 44px input, 5px vertical padding, and 28px selector button. Run the focused meeting layout test and production build.
