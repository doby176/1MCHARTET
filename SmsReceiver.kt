package com.scan2chat.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
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
            val inboundBodies = queryBodies(context, Telephony.Sms.Inbox.CONTENT_URI, sender10, 5)
            var inboundAggregate: ReplyData? = null
            for (body in inboundBodies) {
                val parsed = SmsReceiver().parseReply(body, body, allowDropHints = true)
                inboundAggregate = mergeReplies(inboundAggregate, parsed, includeDropHints = true)
            }

            val sentTexts = queryBodies(context, Telephony.Sms.Sent.CONTENT_URI, sender10, 5)
            var sentAggregate: ReplyData? = null
            for (body in sentTexts) {
                val parsed = SmsReceiver().parseReply(body, body, allowDropHints = false)
                val hasAny = parsed.floor != null || parsed.apartment != null || parsed.code != null
                if (!hasAny) continue
                sentAggregate = mergeReplies(sentAggregate, parsed, includeDropHints = false)
                if (sentAggregate.floor != null && sentAggregate.apartment != null && sentAggregate.code != null) break
            }
            sentAggregate = sentAggregate?.copy(
                leaveAtDoor = false,
                leaveAtBox = false,
                isHome = false,
                wantsUpdate = false,
                specialNote = null
            )

            if (inboundAggregate == null && sentAggregate == null) {
                Log.d(TAG, "No SMS found for $sender10")
                return null
            }

            var finalData = inboundAggregate ?: sentAggregate!!.copy(
                hasReplied = false
            )

            if (sentAggregate != null) {
                if (finalData.floor == null && sentAggregate.floor != null) {
                    finalData = finalData.copy(floor = sentAggregate.floor)
                }
                if (finalData.apartment == null && sentAggregate.apartment != null) {
                    finalData = finalData.copy(apartment = sentAggregate.apartment)
                }
                if (finalData.code == null && sentAggregate.code != null) {
                    finalData = finalData.copy(code = sentAggregate.code)
                }
            }

            finalData = finalData.copy(
                rawSmsBody = inboundAggregate?.rawSmsBody ?: sentAggregate?.rawSmsBody.orEmpty(),
                hasReplied = inboundAggregate != null || (inboundAggregate == null && sentAggregate != null)
            )

            return finalData
        }

        private fun queryBodies(
            context: Context,
            uri: Uri,
            sender10: String,
            limit: Int
        ): List<String> {
            val projection = arrayOf(Telephony.Sms.BODY)
            val selection = "${Telephony.Sms.ADDRESS} = ? OR ${Telephony.Sms.ADDRESS} = ?"
            val selectionArgs = arrayOf(sender10, "+972${sender10.removePrefix("0")}")
            val bodies = mutableListOf<String>()

            context.contentResolver.query(uri, projection, selection, selectionArgs, "date DESC")
                ?.use { cursor ->
                    val bodyCol = cursor.getColumnIndex(Telephony.Sms.BODY)
                    var count = 0
                    if (cursor.moveToFirst()) {
                        do {
                            bodies.add(cursor.getString(bodyCol))
                            count++
                        } while (cursor.moveToNext() && count < limit)
                    }
                }
            return bodies
        }

        private fun mergeReplies(
            current: ReplyData?,
            incoming: ReplyData,
            includeDropHints: Boolean
        ): ReplyData {
            if (current == null) return incoming
            val combinedRaw = listOf(current.rawSmsBody, incoming.rawSmsBody)
                .filter { it.isNotBlank() }
                .distinct()
                .joinToString("\n")

            return current.copy(
                floor = current.floor ?: incoming.floor,
                apartment = current.apartment ?: incoming.apartment,
                code = current.code ?: incoming.code,
                leaveAtDoor = if (includeDropHints) current.leaveAtDoor || incoming.leaveAtDoor else current.leaveAtDoor,
                leaveAtBox = if (includeDropHints) current.leaveAtBox || incoming.leaveAtBox else current.leaveAtBox,
                isHome = if (includeDropHints) current.isHome || incoming.isHome else current.isHome,
                wantsUpdate = if (includeDropHints) current.wantsUpdate || incoming.wantsUpdate else current.wantsUpdate,
                specialNote = if (includeDropHints && current.specialNote == null) incoming.specialNote else current.specialNote,
                rawSmsBody = combinedRaw
            )
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
        val body = messages.joinToString("\n") { it.messageBody }

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

    private fun parseReply(text: String, rawSms: String, allowDropHints: Boolean = true): ReplyData {
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

        val explicitHome = allowDropHints && (
                lower.contains("בבית") ||
                        lower.contains("אני בבית") ||
                        lower.contains("אני פה") ||
                        lower.contains("אני כאן") ||
                        lower.contains("יש מישהו"))

        val noOneHome = allowDropHints && (
                lower.contains("אין אף אחד") ||
                        lower.contains("אין בבית") ||
                        lower.contains("אף אחד לא בבית") ||
                        lower.contains("לא יהיה אף אחד") ||
                        lower.contains("אין מישהו"))

        val yesMatch = if (allowDropHints) Regex("""\bכן\b""").find(lower) else null
        val yesOk = yesMatch?.let {
            val start = (it.range.first - 12).coerceAtLeast(0)
            val snippet = lower.substring(start, it.range.last + 1)
            !snippet.contains("לא")
        } ?: false

        val isHome = allowDropHints && (explicitHome || yesOk) && !noOneHome

        val hasDoor = allowDropHints && lower.contains("דלת")
        val hasBox = allowDropHints && (lower.contains("ארון") || lower.contains("חשמל"))

        val leaveAtDoor = hasDoor
        val leaveAtBox = hasBox

        val wantsUpdate = allowDropHints && (
                lower.contains("תעדכנו") ||
                        lower.contains("תעדכן") ||
                        lower.contains("עדכן אותי") ||
                        lower.contains("תגיד איפה") ||
                        lower.contains("תשלח איפה") ||
                        lower.contains("תשלח לי איפה"))

        val hasIfNotHome = allowDropHints && (
                lower.contains("אם אין") ||
                        lower.contains("אם לא יהיה") ||
                        lower.contains("אם אף אחד") ||
                        lower.contains("אם לא בבית") ||
                        lower.contains("אם אין מישהו"))

        val specialNote = if (allowDropHints) {
            when {
                lower.contains("אין קוד") && lower.contains("להתקשר") -> "אין קוד – להתקשר"
                lower.contains("אין קוד") -> "אין קוד"
                lower.contains("צריך להתקשר") -> "צריך להתקשר"
                lower.contains("להתקשר אלי") -> "להתקשר אלי"
                lower.contains("לדבר איתי") -> "לדבר איתי"
                code == null -> "לא צוין קוד"
                else -> null
            }
        } else null

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