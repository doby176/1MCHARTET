/**
 * Address Scanner Fix - Solution for detecting correct address line
 * 
 * Problem: Scanner detects zip code line instead of actual address line
 * Solution: Filter out zip code patterns and prioritize address-like patterns
 */

import android.util.Log
import com.google.mlkit.vision.text.Text

object AddressScannerHelper {
    
    /**
     * Filters detected text blocks to find the actual address line
     * instead of the zip code line
     */
    fun extractAddressFromText(text: Text): String? {
        val blocks = text.textBlocks
        
        // Collect all lines from all blocks
        val allLines = mutableListOf<Pair<String, Float>>() // text, y-coordinate
        
        for (block in blocks) {
            for (line in block.lines) {
                val lineText = line.text.trim()
                val yCoordinate = line.boundingBox?.centerY() ?: 0f
                
                if (lineText.isNotEmpty()) {
                    allLines.add(Pair(lineText, yCoordinate))
                }
            }
        }
        
        // Sort by Y coordinate (top to bottom)
        val sortedLines = allLines.sortedBy { it.second }
        
        Log.d("AddressScanner", "Detected ${sortedLines.size} lines:")
        sortedLines.forEachIndexed { index, (text, y) ->
            Log.d("AddressScanner", "Line $index: '$text' (y: $y)")
        }
        
        // Filter out zip code patterns and find address
        val addressLine = findAddressLine(sortedLines.map { it.first })
        
        return addressLine
    }
    
    /**
     * Identifies the address line by filtering out zip codes and other non-address patterns
     */
    private fun findAddressLine(lines: List<String>): String? {
        // Patterns that indicate a zip code (should be filtered out)
        val zipCodePatterns = listOf(
            Regex("^\\d{5}(-\\d{4})?$"),  // US zip: 12345 or 12345-6789
            Regex("^\\d{4,6}$"),          // Generic numeric zip codes
            Regex("^[A-Z]{1,2}\\d{1,2}\\s?\\d[A-Z]{2}$"), // UK postcode format
            Regex("^\\d{5,6}$")           // Numeric-only lines (likely zip)
        )
        
        // Patterns that indicate an address (should be prioritized)
        val addressPatterns = listOf(
            Regex(".*\\d+.*[A-Za-z].*"),  // Contains both numbers and letters
            Regex(".*[A-Za-z]{2,}.*\\d+.*"), // Street name followed by number
            Regex(".*\\d+.*[A-Za-z]{2,}.*"), // Number followed by street name
            Regex("^[A-Za-z\\s]+\\d+"),   // Text followed by number (e.g., "shlomo eliraz 3")
            Regex(".*street|.*st|.*avenue|.*ave|.*road|.*rd|.*boulevard|.*blvd", RegexOption.IGNORE_CASE)
        )
        
        // First, filter out obvious zip codes
        val nonZipLines = lines.filter { line ->
            val isZipCode = zipCodePatterns.any { pattern ->
                pattern.matches(line.trim())
            }
            !isZipCode
        }
        
        Log.d("AddressScanner", "After filtering zip codes: ${nonZipLines.size} lines")
        
        // If we have lines after filtering, look for address patterns
        if (nonZipLines.isNotEmpty()) {
            // Prioritize lines that match address patterns
            val addressCandidates = nonZipLines.mapIndexed { originalIndex, line ->
                val addressScore = addressPatterns.count { it.matches(line) }
                Pair(line, addressScore)
            }.sortedByDescending { it.second }
            
            // Return the line with highest address score
            val bestMatch = addressCandidates.firstOrNull()
            if (bestMatch != null && bestMatch.second > 0) {
                Log.d("AddressScanner", "Selected address: '${bestMatch.first}' (score: ${bestMatch.second})")
                return bestMatch.first
            }
            
            // If no pattern match, return the first non-zip line (usually the address is above zip)
            Log.d("AddressScanner", "No pattern match, using first non-zip line: '${nonZipLines.first()}'")
            return nonZipLines.first()
        }
        
        // Fallback: if all lines look like zip codes, return the first one above the zip
        // (assuming address is typically above zip code)
        if (lines.size >= 2) {
            // Return the line before the last one (assuming last is zip code)
            val candidateAddress = lines[lines.size - 2]
            Log.d("AddressScanner", "Fallback: using line before last: '$candidateAddress'")
            return candidateAddress
        }
        
        return lines.firstOrNull()
    }
    
    /**
     * Alternative approach: Find address by looking for lines above zip codes
     */
    fun findAddressAboveZipCode(lines: List<String>): String? {
        // Find zip code line index
        val zipCodePattern = Regex("^\\d{5}(-\\d{4})?$|^\\d{4,6}$")
        
        for (i in lines.indices) {
            if (zipCodePattern.matches(lines[i].trim())) {
                // Found zip code, return the line above it
                if (i > 0) {
                    val addressLine = lines[i - 1]
                    Log.d("AddressScanner", "Found zip code at index $i, using address above: '$addressLine'")
                    return addressLine
                }
            }
        }
        
        // If no zip code found, use first line that looks like an address
        return findAddressLine(lines)
    }
    
    /**
     * Enhanced version that considers context and position
     */
    fun extractAddressWithContext(text: Text): String? {
        val blocks = text.textBlocks
        val allLines = mutableListOf<Triple<String, Float, Float>>() // text, y, x
        
        for (block in blocks) {
            for (line in block.lines) {
                val lineText = line.text.trim()
                val boundingBox = line.boundingBox
                val yCoordinate = boundingBox?.centerY() ?: 0f
                val xCoordinate = boundingBox?.centerX() ?: 0f
                
                if (lineText.isNotEmpty()) {
                    allLines.add(Triple(lineText, yCoordinate, xCoordinate))
                }
            }
        }
        
        // Sort by Y coordinate (top to bottom)
        val sortedLines = allLines.sortedBy { it.second }
        val lineTexts = sortedLines.map { it.first }
        
        // Use the enhanced method that looks for address above zip code
        return findAddressAboveZipCode(lineTexts)
    }
}

/**
 * Example usage in your Activity:
 * 
 * override fun onSuccess(visionText: Text) {
 *     // Instead of directly using visionText.text or first block
 *     val address = AddressScannerHelper.extractAddressWithContext(visionText)
 *     
 *     if (address != null) {
 *         // Use the detected address
 *         addressTextView.text = address
 *     } else {
 *         // Fallback handling
 *         Log.w("AddressScanner", "Could not detect address")
 *     }
 * }
 */
