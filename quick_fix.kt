/**
 * QUICK FIX for Address Scanner Issue
 * 
 * Problem: Detecting zip code line instead of address line "shlomo eliraz 3"
 * 
 * Add this function to your Activity.kt and use it instead of directly
 * accessing visionText.text or textBlocks
 */

import com.google.mlkit.vision.text.Text
import android.util.Log

/**
 * Extract the correct address line, filtering out zip codes
 * 
 * Usage in your onSuccess callback:
 * val address = extractCorrectAddress(visionText)
 * addressTextView.text = address
 */
fun extractCorrectAddress(visionText: Text): String? {
    // Collect all lines with their positions
    val lines = mutableListOf<String>()
    
    visionText.textBlocks.forEach { block ->
        block.lines.forEach { line ->
            val text = line.text.trim()
            if (text.isNotEmpty()) {
                lines.add(text)
            }
        }
    }
    
    if (lines.isEmpty()) return null
    
    Log.d("AddressScan", "All detected lines: $lines")
    
    // Find zip code line (usually all digits, 4-7 characters)
    val zipCodePattern = Regex("^\\d{4,7}$")
    val zipCodeIndex = lines.indexOfFirst { zipCodePattern.matches(it) }
    
    Log.d("AddressScan", "Zip code found at index: $zipCodeIndex")
    
    // If zip code found and there's a line above it, that's likely the address
    if (zipCodeIndex > 0) {
        val address = lines[zipCodeIndex - 1]
        Log.d("AddressScan", "Using line above zip code: '$address'")
        return address
    }
    
    // If no zip code found, look for address pattern (text + number)
    // This matches "shlomo eliraz 3" pattern
    val addressPattern = Regex(".*[A-Za-z\\s]+\\d+.*|.*\\d+.*[A-Za-z\\s]+.*")
    val addressLine = lines.firstOrNull { 
        addressPattern.matches(it) && !zipCodePattern.matches(it)
    }
    
    if (addressLine != null) {
        Log.d("AddressScan", "Using address pattern match: '$addressLine'")
        return addressLine
    }
    
    // Fallback: return first line that's not a zip code
    val nonZipLine = lines.firstOrNull { !zipCodePattern.matches(it) }
    Log.d("AddressScan", "Fallback: using first non-zip line: '$nonZipLine'")
    return nonZipLine ?: lines.firstOrNull()
}

/**
 * SIMPLEST FIX - Just use this in your onSuccess:
 * 
 * override fun onSuccess(visionText: Text) {
 *     val address = extractCorrectAddress(visionText) ?: visionText.text
 *     addressTextView.text = address
 * }
 */
