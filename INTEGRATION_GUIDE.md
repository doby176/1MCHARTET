# Address Scanner Fix - Integration Guide

## Problem
The scanner is detecting the zip code line instead of the actual address line. For example, when scanning "WA0179.jpeg", it picks up the zip code instead of "shlomo eliraz 3" which is one line above.

## Solution Overview
The fix filters out zip code patterns and prioritizes lines that look like addresses. It also uses positional heuristics (address is typically above zip code).

## Integration Steps

### Step 1: Add the Helper Class
Copy the `AddressScannerHelper` class from `address_scanner_fix.kt` into your project, or add it as a separate Kotlin file in your app.

### Step 2: Modify Your Activity.kt

**Before (problematic code):**
```kotlin
override fun onSuccess(visionText: Text) {
    // This might pick up the zip code line
    val detectedText = visionText.textBlocks.firstOrNull()?.text
    addressTextView.text = detectedText
}
```

**After (fixed code):**
```kotlin
import com.yourpackage.AddressScannerHelper

override fun onSuccess(visionText: Text) {
    // Use the helper to extract the correct address
    val address = AddressScannerHelper.extractAddressWithContext(visionText)
    
    if (address != null) {
        addressTextView.text = address
        Log.d("AddressScanner", "Detected address: $address")
    } else {
        // Fallback: show all detected text for debugging
        addressTextView.text = visionText.text
        Log.w("AddressScanner", "Could not detect address, showing all text")
    }
}
```

### Step 3: Customize Patterns (if needed)

If your addresses have specific formats, you can modify the patterns in `findAddressLine()`:

**For international addresses:**
- Add country-specific zip code patterns
- Adjust address patterns to match your locale

**Example for Israeli addresses:**
```kotlin
val zipCodePatterns = listOf(
    Regex("^\\d{5,7}$"),  // Israeli zip codes are 5-7 digits
    Regex("^\\d{4,6}$")
)

val addressPatterns = listOf(
    Regex(".*[א-ת]+.*\\d+.*"),  // Hebrew characters + numbers
    Regex(".*[A-Za-z]+.*\\d+.*"), // English characters + numbers
    Regex("^[A-Za-z\\s]+\\d+")   // Text followed by number
)
```

## Testing

1. Test with your "WA0179.jpeg" image
2. Check logs to see which lines are detected
3. Verify that "shlomo eliraz 3" is selected instead of the zip code

## Debugging

Enable logging to see what's happening:
```kotlin
// The helper already includes Log.d statements
// Check Logcat for "AddressScanner" tag
```

## Alternative Approach

If the pattern-based approach doesn't work well, you can use a simpler positional approach:

```kotlin
// In your Activity.kt
override fun onSuccess(visionText: Text) {
    val lines = visionText.textBlocks.flatMap { it.lines }
        .map { it.text.trim() }
        .filter { it.isNotEmpty() }
    
    // Find zip code (usually all digits, 4-6 characters)
    val zipCodeIndex = lines.indexOfFirst { 
        it.matches(Regex("^\\d{4,6}$")) 
    }
    
    // If zip code found, use line above it
    val address = if (zipCodeIndex > 0) {
        lines[zipCodeIndex - 1]
    } else {
        // Fallback: use first line that's not a zip code
        lines.firstOrNull { !it.matches(Regex("^\\d{4,6}$")) }
    }
    
    addressTextView.text = address ?: lines.firstOrNull() ?: ""
}
```

## Common Issues

1. **Still detecting zip code**: Adjust the zip code regex patterns to match your format
2. **Missing address**: Check if address patterns match your address format
3. **Wrong line selected**: Use the positional approach (address above zip) as fallback
