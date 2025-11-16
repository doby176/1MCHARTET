package com.scan2chat.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import java.util.regex.Pattern

data class ReplyData(
    val floor: String? = null,
    val apartment: String? = null,
    val code: String? = null,
    val leaveAtDoor: Boolean = false,
    val leaveAtBox: Boolean = false,
    val isHome: Boolean = false,
    val hasReplied: Boolean = false,
    val rawSmsBody: String = "",
    val wantsUpdate: Boolean = false,
    val specialNote: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)

class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SMS_DEBUG"

        fun getLatestReply(
            context: Context,
            sender10: String
        ): ReplyData? {
            val uri = Telephony.Sms.CONTENT_URI
            val projection = arrayOf(Telephony.Sms.BODY)
            val selection = "${Telephony.Sms.ADDRESS} = ? OR ${Telephony.Sms.ADDRESS} = ?"
            val selectionArgs = arrayOf(sender10, "+972${sender10.removePrefix("0")}")

            return context.contentResolver.query(uri, projection, selection, selectionArgs, "date DESC")
                ?.use { cursor ->
                    if (!cursor.moveToFirst()) {
                        Log.d(TAG, "No SMS found for $sender10")
                        return null
                    }
                    val bodyCol = cursor.getColumnIndex(Telephony.Sms.BODY)
                    val bodies = mutableListOf<String>()
                    do {
                        bodies.add(cursor.getString(bodyCol))
                    } while (cursor.moveToNext())

                    val fullBody = bodies.joinToString("")
                    SmsReceiver().parseReply(fullBody, fullBody)
                } ?: run {
                    Log.d(TAG, "Query failed or no permission")
                    null
                }
        }

        fun forceParseRepliesForSender(
            context: Context,
            sender10: String,
            onReplyParsed: (ReplyData) -> Unit
        ) {
            Log.d(TAG, "FORCE-PARSE requested for $sender10")
            val reply = getLatestReply(context, sender10)
            if (reply != null) {
                Log.d(TAG, "FORCE-PARSE result: $reply")
                onReplyParsed(reply)
            } else {
                Log.d(TAG, "FORCE-PARSE result: null")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        Log.d(TAG, "SMS RECEIVED! Parsing...")

        val messages = parseSmsMessages(intent.extras, intent.getStringExtra("format"))
        if (messages.isEmpty()) return

        val sender = messages.first().originatingAddress ?: return
        val body = messages.joinToString("") { it.messageBody }

        Log.d(TAG, "From: $sender | Body: $body")

        val sender10 = toLocal10Digit(sender)
        if (!MainActivity.contactedNumbers.contains(sender10)) {
            Log.d(TAG, "IGNORED: $sender10 not in contacted list")
            return
        }

        val reply = parseReply(body, body)
        Log.d(TAG, "PARSED (live): $reply")
        MainActivity.addReply(sender10, reply)
    }

    private fun parseReply(text: String, rawSms: String): ReplyData {
        val cleanedOriginal = text
            .lowercase()
            .replace(Regex("[\\s\\u200E]+"), " ")
            .replace(Regex("[^\\p{L}\\p{N}\\s*#:'.-]"), " ")
        val lower = cleanedOriginal

        Log.d("PARSE_DEBUG", "Input: '$text'")
        Log.d("PARSE_DEBUG", "Cleaned: '$lower'")

        val codePattern = Pattern.compile("(?:^|\\s)([*#]?)(\\d{3,5})([*#]?)(?:$|\\s)")
        val codeMatch = codePattern.matcher(lower)
        val codeFromPattern = if (codeMatch.find()) {
            val prefix = codeMatch.group(1) ?: ""
            val number = codeMatch.group(2) ?: ""
            val suffix = codeMatch.group(3) ?: ""
            val fullCode = "$prefix$number$suffix"
            if (fullCode.isNotEmpty()) fullCode else null
        } else null

        var code = codeFromPattern ?: regex("קוד\\s*[*:]?\\s*([*#]?\\d{3,5}[*#]?)", lower)
            ?: regex("([*#]?\\d{3,5}[*#]?)\\s*קוד", lower)

        if (code == null) {
            val digitsOnly = Regex("(?<!\\d)(\\d{4,5})(?!\\d)").find(lower)
            if (digitsOnly != null) {
                val candidate = digitsOnly.groupValues[1]
                val idx = digitsOnly.range.first
                val snippetStart = (idx - 10).coerceAtLeast(0)
                val snippetEnd = (idx + 10).coerceAtMost(lower.length)
                val snippet = lower.substring(snippetStart, snippetEnd)
                val hasFloor = snippet.contains("קומ")
                val hasApartment = snippet.contains("דיר")
                if (!hasFloor && !hasApartment) {
                    code = candidate
                }
            }
        }

        val floor = regex("קומה\\s*(\\d+)", lower)
            ?: regex("קו['\"]?\\s*(\\d+)", lower)
            ?: regex("בקומה\\s+(\\d+)", lower)

        val apartment = regex("דירה\\s*(\\d+)", lower)
            ?: regex("בדירה\\s+(\\d+)", lower)

        val explicitHome = lower.contains("בבית") ||
                lower.contains("אני בבית") ||
                lower.contains("אני פה") ||
                lower.contains("אני כאן") ||
                lower.contains("יש מישהו")

        val noOneHome = lower.contains("אין אף אחד") ||
                lower.contains("אין בבית") ||
                lower.contains("אף אחד לא בבית") ||
                lower.contains("לא יהיה אף אחד") ||
                lower.contains("אין מישהו")

        val yesMatch = Regex("""\bכן\b""").find(lower)
        val yesOk = yesMatch?.let {
            val start = (it.range.first - 12).coerceAtLeast(0)
            val snippet = lower.substring(start, it.range.last + 1)
            !snippet.contains("לא")
        } ?: false

        val isHome = (explicitHome || yesOk) && !noOneHome

        val hasDoor = lower.contains("דלת")
        val hasBox = lower.contains("ארון") || lower.contains("חשמל")

        val leaveAtDoor = hasDoor
        val leaveAtBox = hasBox

        val wantsUpdate = lower.contains("תעדכנו") ||
                lower.contains("תעדכן") ||
                lower.contains("עדכן אותי") ||
                lower.contains("תגיד איפה") ||
                lower.contains("תשלח איפה") ||
                lower.contains("תשלח לי איפה")

        val hasIfNotHome = lower.contains("אם אין") ||
                lower.contains("אם לא יהיה") ||
                lower.contains("אם אף אחד") ||
                lower.contains("אם לא בבית") ||
                lower.contains("אם אין מישהו")

        val specialNote = when {
            lower.contains("אין קוד") && lower.contains("להתקשר") -> "אין קוד – להתקשר"
            lower.contains("אין קוד") -> "אין קוד"
            lower.contains("צריך להתקשר") -> "צריך להתקשר"
            lower.contains("להתקשר אלי") -> "להתקשר אלי"
            lower.contains("לדבר איתי") -> "לדבר איתי"
            code == null -> "לא צוין קוד"
            else -> null
        }

        return ReplyData(
            floor = floor,
            apartment = apartment,
            code = code,
            leaveAtDoor = leaveAtDoor || (hasIfNotHome && hasDoor),
            leaveAtBox = leaveAtBox || (hasIfNotHome && hasBox),
            isHome = isHome,
            hasReplied = true,
            rawSmsBody = rawSms.trim(),
            wantsUpdate = wantsUpdate,
            specialNote = specialNote
        ).also {
            Log.d("PARSE_DEBUG", "Final → $it")
        }
    }

    private fun parseSmsMessages(bundle: Bundle?, format: String?): List<SmsMessage> {
        if (bundle == null) return emptyList()
        try {
            val msgs = Telephony.Sms.Intents.getMessagesFromIntent(Intent().apply { putExtras(bundle) })
            if (!msgs.isNullOrEmpty()) return msgs.toList()
        } catch (e: Exception) {
            Log.w(TAG, "getMessagesFromIntent failed", e)
        }
        val pdus = bundle.get("pdus") as Array<*>? ?: return emptyList()
        return pdus.mapNotNull {
            try {
                SmsMessage.createFromPdu(it as ByteArray, format)
            } catch (e: Exception) {
                null
            }
        }
    }

    private fun regex(pattern: String, text: String): String? {
        return try {
            val m = Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(text)
            if (m.find()) m.group(1) else null
        } catch (e: Exception) {
            null
        }
    }

    private fun toLocal10Digit(phone: String): String {
        val digits = phone.replace(Regex("[^0-9]"), "")
        return when {
            digits.startsWith("972") && digits.length >= 12 -> "0" + digits.substring(3).take(9)
            digits.startsWith("+972") && digits.length >= 13 -> "0" + digits.substring(4).take(9)
            digits.startsWith("0") && digits.length >= 10 -> digits.take(10)
            else -> digits.takeLast(10)
        }
    }
}