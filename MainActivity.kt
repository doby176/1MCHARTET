package com.scan2chat.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ImageSpan
import android.util.Log
import android.view.View
import android.view.ViewTreeObserver
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import java.net.URLEncoder
import java.util.ArrayDeque
import java.util.LinkedHashSet
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern
import kotlin.math.min


class MainActivity : AppCompatActivity() {

    private lateinit var previewView: PreviewView
    private lateinit var tvDetected: TextView
    private lateinit var btnSend: Button
    private lateinit var btnOpenWhatsApp: Button
    private lateinit var btnCall: Button
    private lateinit var btnClear: Button
    private lateinit var btnToggleSendMode: Button
    private lateinit var btnDeliveryMode: Button
    private lateinit var btnBulkSend: Button
    private lateinit var etCustomMessage: EditText
    private lateinit var flashAlert: LinearLayout
    private lateinit var btnLogout: Button
    private lateinit var tvWhatsAppWarning: TextView
    private lateinit var topBar: LinearLayout
    private lateinit var detectionPanel: LinearLayout
    private lateinit var buttonContainer: LinearLayout
    private lateinit var scanOverlay: ScanOverlayView
    private val cameraExecutor = Executors.newSingleThreadExecutor()
    private var lastDetectedNumber: String? = null
    private var confirmedNumber: String? = null
    private var detectionCount = 0
    private var lastScanTime = 0L
    private val MIN_SCAN_INTERVAL = 300L
    private var camera: Camera? = null
    private var mediaPlayer: MediaPlayer? = null
    private var bulkLimitDialogShown = false
    private val whatsappWarningHideRunnable = Runnable {
        tvWhatsAppWarning.visibility = View.GONE
    }
    private val roiRectNorm = RectF(0f, 0f, 1f, 1f)
    private val scanWindowRectPx = Rect()

    private var isBulkScanMode = false
    private var isWhatsAppSendMode = false

    private val phonePattern = Pattern.compile("(\\+?972[0-9]{8,9}|0?5[0-9]{8})")
    private val requiredSmsPermissions = arrayOf(
        Manifest.permission.SEND_SMS,
        Manifest.permission.READ_SMS
    )

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) checkAccessAndStart() else Toast.makeText(this, "Camera permission required", Toast.LENGTH_SHORT).show()
    }

    private val requestSmsPermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants.all { it.value }) {
            Log.d("PERMISSION", "All SMS permissions granted")
        } else {
            Toast.makeText(this, "SMS reply detection disabled without READ_SMS", Toast.LENGTH_LONG).show()
        }
    }

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()
    private val defaultMessage = "היי 😊 משלוח בדרך 9:00-14:00. אפשר קומה/דירה+קוד? אם אין מישהו בבית להשאיר בדלת או בארון חשמל?"
    private val whatsappModeWarningText =
        "מצב WhatsApp פעיל. שליחת הודעות מרובות מחשבון רגיל עלולה לגרום לחסימה של 24 שעות ואף לצמיתות. מומלץ להשתמש ב-WhatsApp Business ולהשאיר מרווח של לפחות 30 שניות בין הודעות. במצב זה השליחה הקבוצתית מושבתת."

    private val flashHandler = Handler(Looper.getMainLooper())
    private val hideFlashRunnable = Runnable { flashAlert.visibility = View.GONE }

    companion object {
        val bulkQueue = LinkedHashSet<String>()
        val contactedNumbers = mutableSetOf<String>()
        val replyMap = mutableMapOf<String, ReplyData>()
        var isDeliveryMode = false
        var isBulkMode = false
        private var onReplyUpdate: (() -> Unit)? = null
        lateinit var appContext: Context

        private const val PREF_NAME = "Scan2ChatPrefs"
        private const val KEY_SMS_PERMISSION_EXPLAINED = "sms_perm_rationale"
        private const val MAX_BULK_PER_WINDOW = 30
        private const val RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000L
        private val sendTimestamps = ArrayDeque<Long>()

        fun addReply(phone: String, data: ReplyData) {
            replyMap[phone] = data
            onReplyUpdate?.invoke()
            Log.d("REPLY_SAVED", "Saved reply for $phone: $data")

            Handler(Looper.getMainLooper()).post {
                try {
                    Toast.makeText(appContext, "תגובה התקבלה!", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Log.e("REPLY_SAVED", "Toast failed", e)
                }
            }
        }

        fun resetBulkMode() {
            isBulkMode = false
        }

        fun pruneOldSends() {
            val cutoff = System.currentTimeMillis() - RATE_LIMIT_WINDOW_MS
            while (sendTimestamps.isNotEmpty() && sendTimestamps.first() < cutoff) {
                sendTimestamps.removeFirst()
            }
        }

        fun remainingQuota(): Int {
            pruneOldSends()
            return MAX_BULK_PER_WINDOW - sendTimestamps.size
        }

        fun recordSend(count: Int) {
            val now = System.currentTimeMillis()
            repeat(count) { sendTimestamps.addLast(now) }
        }

        fun timeUntilNextWindow(): Long? {
            pruneOldSends()
            val first = sendTimestamps.firstOrNull() ?: return null
            val wait = first + RATE_LIMIT_WINDOW_MS - System.currentTimeMillis()
            return if (wait <= 0L) null else wait
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        appContext = this
        supportActionBar?.hide()

        previewView = findViewById(R.id.previewView)
        tvDetected = findViewById(R.id.tvDetected)
        btnSend = findViewById(R.id.btnSend)
        btnOpenWhatsApp = findViewById(R.id.btnOpenWhatsApp)
        btnCall = findViewById(R.id.btnCall)
        btnClear = findViewById(R.id.btnClear)
        btnToggleSendMode = findViewById(R.id.btnToggleSendMode)
        btnDeliveryMode = findViewById(R.id.btnDeliveryMode)
        btnBulkSend = findViewById(R.id.btnBulkSend)
        etCustomMessage = findViewById(R.id.etCustomMessage)
        flashAlert = findViewById(R.id.flashAlert)
        btnLogout = findViewById(R.id.btnLogout)
        tvWhatsAppWarning = findViewById(R.id.tvWhatsAppWarning)
        topBar = findViewById(R.id.topBar)
        detectionPanel = findViewById(R.id.detectionPanel)
        buttonContainer = findViewById(R.id.buttonContainer)
        scanOverlay = findViewById(R.id.scanOverlay)

        // Restore state if app was backgrounded
        restoreSavedState()

        previewView.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (previewView.width == 0 || previewView.height == 0) return
                updateScanWindowBounds()
                previewView.viewTreeObserver.removeOnGlobalLayoutListener(this)
            }
        })
        val roiLayoutListener = ViewTreeObserver.OnGlobalLayoutListener {
            updateScanWindowBounds()
        }
        detectionPanel.viewTreeObserver.addOnGlobalLayoutListener(roiLayoutListener)
        buttonContainer.viewTreeObserver.addOnGlobalLayoutListener(roiLayoutListener)
        etCustomMessage.viewTreeObserver.addOnGlobalLayoutListener(roiLayoutListener)

        tvDetected.text = "סריקה..."
        updateSendModeToggle()

        updateDeliveryButtonVisibility()
        updateBulkSendButton()

        btnLogout.setOnClickListener {
            auth.signOut()
            clearUserStateOnLogout()
            startActivity(Intent(this, AuthActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            })
            finish()
        }

        btnSend.setOnClickListener {
            confirmedNumber?.let { number ->
                if (isWhatsAppSendMode) {
                    openWhatsApp(
                        number,
                        includeBody = !isDeliveryMode
                    )
                } else {
                    sendSmsMessage(
                        number,
                        useCustomMessage = etCustomMessage.text.toString().trim().isNotEmpty(),
                        forceEmptyBody = isDeliveryMode
                    )
                }
            } ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnOpenWhatsApp.setOnClickListener {
            if (!isDeliveryMode) {
                showWhatsAppWarning()
            }
            confirmedNumber?.let { openWhatsApp(it, includeBody = !isDeliveryMode) }
                ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnCall.setOnClickListener {
            confirmedNumber?.let { number ->
                val localNumber = if (number.startsWith("+972")) "0" + number.substring(4) else number
                startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$localNumber")))
            } ?: Toast.makeText(this, "לא זוהה מספר", Toast.LENGTH_SHORT).show()
        }

        btnClear.setOnClickListener { resetScanState() }
        
        // Add double-tap listener for manual phone entry
        tvDetected.setOnClickListener { view ->
            val now = System.currentTimeMillis()
            val lastTap = tvDetected.tag as? Long ?: 0L
            if (now - lastTap < 500) {
                // Double tap detected
                showManualPhoneEntryDialog()
            }
            tvDetected.tag = now
        }
        btnToggleSendMode.setOnClickListener {
            if (isDeliveryMode) {
                Toast.makeText(this, "מצב WhatsApp זמין רק במצב סריקה רגיל", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            isWhatsAppSendMode = !isWhatsAppSendMode
            if (isWhatsAppSendMode && isBulkScanMode) {
                exitBulkScanMode()
            }
            updateSendModeToggle()
            if (isWhatsAppSendMode) {
                showWhatsAppWarning(whatsappModeWarningText, 10_000L)
            } else {
                hideWhatsAppWarning()
            }
        }

        btnDeliveryMode.setOnClickListener {
            if (isBulkScanMode) exitBulkScanMode()
            isDeliveryMode = !isDeliveryMode
            if (isDeliveryMode && isWhatsAppSendMode) {
                isWhatsAppSendMode = false
                updateSendModeToggle()
                Toast.makeText(this, "מצב WhatsApp כובה אוטומטית במצב חלוקה", Toast.LENGTH_SHORT).show()
            }
            updateDeliveryButton()
            Toast.makeText(this, if (isDeliveryMode) "מצב משלוח הופעל" else "חזרת למצב סריקה", Toast.LENGTH_SHORT).show()
        }

        btnBulkSend.setOnClickListener {
            if (isWhatsAppSendMode) {
                Toast.makeText(this, "שליחה קבוצתית זמינה רק במצב SMS", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (isBulkScanMode) {
                showBulkSendDialog()
            } else {
                isBulkScanMode = true
                isBulkMode = true
                updateBulkSendButton()
                Toast.makeText(this, "מצב סריקה קבוצתית – סרוק עד 30 מספרים ושלח!", Toast.LENGTH_LONG).show()
            }
        }

        onReplyUpdate = { runOnUiThread { updateDeliveryButtonVisibility(); updateBulkSendButton() } }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }

        ensureSmsPermissions()

        checkAccessAndStart()
    }

    private fun updateBulkSendButton() {
        val queueSize = bulkQueue.size
        btnBulkSend.visibility = View.VISIBLE
        when {
            isWhatsAppSendMode -> {
                btnBulkSend.text = "שליחה קבוצתית (SMS בלבד)"
                styleButton(btnBulkSend, R.drawable.bg_button_secondary, enabled = false)
            }
            isBulkScanMode -> {
                btnBulkSend.text = "שלח לרשימה ($queueSize/30)"
                styleButton(btnBulkSend, R.drawable.bg_button_primary, enabled = true)
            }
            else -> {
                val suffix = if (queueSize == 0) "" else " ($queueSize)"
                btnBulkSend.text = "שליחה קבוצתית$suffix"
                styleButton(btnBulkSend, R.drawable.bg_button_secondary, enabled = true)
            }
        }
    }

    private fun styleButton(button: Button, backgroundRes: Int, enabled: Boolean = true) {
        button.setBackgroundResource(backgroundRes)
        button.backgroundTintList = null  // CRITICAL: Disable Material tint to show custom drawables
        button.isEnabled = enabled
        button.alpha = if (enabled) 1f else 0.5f
    }


    private fun ensureSmsPermissions() {
        val missing = requiredSmsPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) return

        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        val explained = prefs.getBoolean(KEY_SMS_PERMISSION_EXPLAINED, false)
        val requestAction = {
            requestSmsPermissions.launch(missing.toTypedArray())
        }

        if (!explained) {
            AlertDialog.Builder(this)
                .setTitle("נדרשת הרשאת SMS")
                .setMessage("כדי להציג את תגובות הלקוחות בתוך מצב משלוח, האפליקציה צריכה גישה לקריאת וסנכרון SMS שנשלחו אליך. הנתונים נשארים במכשיר בלבד.")
                .setPositiveButton("להמשיך") { _, _ ->
                    prefs.edit().putBoolean(KEY_SMS_PERMISSION_EXPLAINED, true).apply()
                    requestAction()
                }
                .setNegativeButton("ביטול", null)
                .show()
        } else {
            requestAction()
        }
    }

    private fun showWhatsAppWarning(message: String? = null, durationMs: Long = 10_000L) {
        tvWhatsAppWarning.text = message ?: getString(R.string.whatsapp_warning)
        tvWhatsAppWarning.visibility = View.VISIBLE
        flashHandler.removeCallbacks(whatsappWarningHideRunnable)
        flashHandler.postDelayed(whatsappWarningHideRunnable, durationMs)
    }

    private fun hideWhatsAppWarning() {
        flashHandler.removeCallbacks(whatsappWarningHideRunnable)
        tvWhatsAppWarning.visibility = View.GONE
    }

    private fun showBulkSendDialog() {
        val eligibleNumbers = bulkQueue.filter { phone ->
            fetchLatestReply(phone)?.apartment == null
        }

        if (eligibleNumbers.isEmpty()) {
            Toast.makeText(this, "אין מספרים חדשים – כולם כבר ענו עם דירה!", Toast.LENGTH_LONG).show()
            return
        }

        val display = eligibleNumbers.map { formatForDisplay(it) }.toTypedArray()
        val checked = BooleanArray(eligibleNumbers.size) { true }

        AlertDialog.Builder(this)
            .setTitle("בחר מספרים לשליחה (עד 30 בכל 5 דקות)")
            .setMultiChoiceItems(display, checked) { _, which, isChecked -> checked[which] = isChecked }
            .setPositiveButton("שלח עכשיו") { _, _ ->
                val selected = eligibleNumbers.filterIndexed { i, _ -> checked[i] }
                if (selected.isEmpty()) {
                    Toast.makeText(this, "לא נבחרו מספרים", Toast.LENGTH_SHORT).show()
                } else {
                    sendBulkSms(selected)
                    exitBulkScanMode()
                }
            }
            .setNegativeButton("בטל", null)
            .setNeutralButton("נקה רשימה") { _, _ ->
                clearBulkQueue()
                Toast.makeText(this, "הרשימה נוקתה", Toast.LENGTH_SHORT).show()
            }
            .show()
    }

    private fun exitBulkScanMode() {
        isBulkScanMode = false
        isBulkMode = false
        updateBulkSendButton()
        Toast.makeText(this, "חזרת למצב סריקה רגילה", Toast.LENGTH_SHORT).show()
    }

    private fun sendBulkSms(numbers: List<String>) {
        val quota = remainingQuota()
        if (quota <= 0) {
            showRateLimitWaitMessage()
            return
        }

        val finalMessage = if (etCustomMessage.text.toString().trim().isNotEmpty()) {
            etCustomMessage.text.toString().trim()
        } else defaultMessage

        val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(SmsManager::class.java)
        } else {
            SmsManager.getDefault()
        }

        val toSend = numbers.take(quota)
        if (toSend.isEmpty()) {
            showRateLimitWaitMessage()
            return
        }

        var sentCount = 0
        toSend.forEach { rawNumber ->
            val cleanNumber = normalizePhone(rawNumber) ?: return@forEach
            val parts = smsManager.divideMessage(finalMessage)

            smsManager.sendMultipartTextMessage(
                cleanNumber,
                null,
                parts,
                null,
                null
            )

            sentCount++
            val local10 = toLocal10Digit(cleanNumber)
            contactedNumbers.add(local10)
            bulkQueue.remove(local10)
        }

        recordSend(sentCount)
        val remaining = numbers.size - sentCount
        Toast.makeText(this, "נשלחו $sentCount הודעות SMS", Toast.LENGTH_LONG).show()
        if (remaining > 0) {
            Toast.makeText(this, "נשארו $remaining מספרים – נסה שוב בעוד 5 דקות", Toast.LENGTH_LONG).show()
        }

        if (bulkQueue.size < MAX_BULK_PER_WINDOW) bulkLimitDialogShown = false
        updateDeliveryButtonVisibility()
        updateBulkSendButton()
    }

    private fun checkAccessAndStart() {
        val user = auth.currentUser ?: return
        val uid = user.uid

        db.collection("users").document(uid).get().addOnSuccessListener { doc ->
            if (doc.getBoolean("terms_accepted") != true) {
                startActivity(Intent(this, TermsActivity::class.java))
                finish()
                return@addOnSuccessListener
            }

            val lifetime = doc.getBoolean("lifetime") ?: false
            val expiresAt = doc.getLong("expires_at") ?: 0L
            val now = System.currentTimeMillis()

            if (!lifetime && expiresAt < now) {
                startActivity(Intent(this, PaymentActivity::class.java))
                finish()
            } else {
                startCamera()
            }
        }.addOnFailureListener {
            startActivity(Intent(this, TermsActivity::class.java))
            finish()
        }
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(this)
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val analyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { it.setAnalyzer(cameraExecutor, ::processImageProxy) }
            val selector = CameraSelector.DEFAULT_BACK_CAMERA
            try {
                cameraProvider.unbindAll()
                camera = cameraProvider.bindToLifecycle(this, selector, preview, analyzer)
                camera?.cameraControl?.enableTorch(true)
            } catch (e: Exception) {
                Log.e("Scan2Chat", "Camera bind failed", e)
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun processImageProxy(imageProxy: ImageProxy) {
        val mediaImage = imageProxy.image ?: run { imageProxy.close(); return }
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)

        val now = System.currentTimeMillis()
        if (now - lastScanTime < MIN_SCAN_INTERVAL) { imageProxy.close(); return }
        lastScanTime = now

        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(image)
            .addOnSuccessListener { visionText ->
                val imageWidth = imageProxy.width.toFloat().coerceAtLeast(1f)
                val imageHeight = imageProxy.height.toFloat().coerceAtLeast(1f)
                var handled = false

                val detectionRect = RectF(
                    roiRectNorm.left,
                    roiRectNorm.top,
                    roiRectNorm.right,
                    (roiRectNorm.bottom + 0.11f).coerceAtMost(1f)
                )

                visionText.textBlocks.forEach { block ->
                    if (handled) return@forEach
                    val box = block.boundingBox ?: return@forEach
                    val blockLeft = (box.left.coerceAtLeast(0)).toFloat() / imageWidth
                    val blockTop = (box.top.coerceAtLeast(0)).toFloat() / imageHeight
                    val blockRight = (box.right.coerceAtMost(imageWidth.toInt())).toFloat() / imageWidth
                    val blockBottom = (box.bottom.coerceAtMost(imageHeight.toInt())).toFloat() / imageHeight
                    val intersects = !(blockRight < detectionRect.left ||
                            blockLeft > detectionRect.right ||
                            blockBottom < detectionRect.top ||
                            blockTop > detectionRect.bottom)
                    if (!intersects) return@forEach

                    val cleaned = block.text.replace(" ", "").replace("-", "")
                    val matcher = phonePattern.matcher(cleaned)
                    while (matcher.find()) {
                        val raw = matcher.group(0)
                        if (processDetectedNumber(raw)) {
                            handled = true
                            break
                        }
                    }
                }

                if (!handled && detectionCount > 0 && lastDetectedNumber != null && confirmedNumber == null) {
                    detectionCount = 0
                    runOnUiThread {
                        tvDetected.text = "סריקה..."
                        tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
                        scanOverlay.setActive(false)
                    }
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }

    private fun processDetectedNumber(raw: String): Boolean {
        val normalized = normalizePhone(raw) ?: return false
        if (normalized.length !in 11..13) return false
        runOnUiThread { scanOverlay.setActive(true) }

        if (lastDetectedNumber != normalized) {
            lastDetectedNumber = normalized
            detectionCount = 1
            confirmedNumber = null
        } else {
            detectionCount++
        }

        runOnUiThread {
            val display = formatForDisplay(normalized)
            tvDetected.text = "$display (${detectionCount}/2)"
            if (detectionCount >= 2) {
                tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
            } else {
                tvDetected.setBackgroundColor(Color.parseColor("#FF9800"))
            }
        }

        if (detectionCount >= 2 && confirmedNumber == null) {
            confirmedNumber = normalized
            runOnUiThread { playSound("beep") }

            val confirmedDisplay = formatForDisplay(normalized)
            runOnUiThread {
                tvDetected.text = confirmedDisplay
                tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
            }

            val local10 = toLocal10Digit(normalized)
            val reply = fetchLatestReply(local10)

            addNumberToBulkQueue(local10, reply)

            Handler(Looper.getMainLooper()).postDelayed({
                if (confirmedNumber == normalized) {
                    when {
                        isBulkScanMode -> {
                            if (reply?.apartment == null) {
                                Toast.makeText(this, "נוסף: $confirmedDisplay", Toast.LENGTH_SHORT).show()
                            } else {
                                showAlreadyRepliedInBulkFlash()
                            }
                        }
                        isDeliveryMode -> {
                            SmsReceiver.forceParseRepliesForSender(this, local10) { addReply(local10, it) }
                            showDeliveryPopup(normalized)
                        }
                        else -> {
                            if (reply?.apartment != null) {
                                showAlreadyRepliedFlash()
                            } else {
                                val useCustom = etCustomMessage.text.toString().trim().isNotEmpty()
                                if (isWhatsAppSendMode) {
                                    openWhatsApp(normalized, includeBody = true)
                                } else {
                                    sendSmsMessage(normalized, useCustom)
                                }
                            }
                        }
                    }
                }
            }, 800)
        }
        return true
    }

    private fun addNumberToBulkQueue(local10: String, reply: ReplyData?) {
        if (!isBulkScanMode) return
        if (reply?.apartment != null) return
        if (bulkQueue.contains(local10)) return
        if (bulkQueue.size >= MAX_BULK_PER_WINDOW) {
            showBulkCapacityDialog()
            return
        }

        bulkQueue.add(local10)
        updateBulkSendButton()
        if (bulkQueue.size == MAX_BULK_PER_WINDOW) {
            showBulkCapacityDialog()
        }
    }

    private fun showBulkCapacityDialog() {
        if (bulkLimitDialogShown) return
        bulkLimitDialogShown = true
        AlertDialog.Builder(this)
            .setTitle("הגעת למגבלה")
            .setMessage("ניתן לסרוק עד 30 מספרים בכל מחזור. שלח את הרשימה והמתן 5 דקות למחזור הבא.")
            .setPositiveButton("שלח עכשיו") { _, _ -> showBulkSendDialog() }
            .setNegativeButton("סגור", null)
            .show()
    }

    private fun clearBulkQueue() {
        bulkQueue.clear()
        bulkLimitDialogShown = false
        updateBulkSendButton()
    }

    private fun updateScanWindowBounds() {
        if (previewView.width == 0 || previewView.height == 0) return
        val marginPx = (16 * resources.displayMetrics.density).toInt()
        val bottomGapPx = (32 * resources.displayMetrics.density).toInt() // Larger gap at bottom
        var top = topBar.bottom + marginPx
        var bottom = detectionPanel.top - bottomGapPx // Increased gap to prevent overlap
        var left = (previewView.width * 0.1f).toInt()
        var right = (previewView.width * 0.9f).toInt()

        if (bottom <= top) {
            top = (previewView.height * 0.15f).toInt()
            bottom = (previewView.height * 0.65f).toInt()
        }
        // Remove max height constraint to allow full scanning area
        if (right <= left) {
            left = (previewView.width * 0.2f).toInt()
            right = (previewView.width * 0.8f).toInt()
        }

        scanWindowRectPx.set(left, top, right, bottom)
        scanOverlay.updateWindow(scanWindowRectPx)
        roiRectNorm.set(
            left.toFloat() / previewView.width,
            top.toFloat() / previewView.height,
            right.toFloat() / previewView.width,
            bottom.toFloat() / previewView.height
        )
    }

    private fun fetchLatestReply(local10: String): ReplyData? {
        val reply = SmsReceiver.getLatestReply(this, local10)
        return if (reply != null) {
            replyMap[local10] = reply
            reply
        } else {
            replyMap.remove(local10)
            null
        }
    }

    private fun showRateLimitWaitMessage() {
        val waitMs = timeUntilNextWindow() ?: RATE_LIMIT_WINDOW_MS
        val clamped = waitMs.coerceAtLeast(0L)
        val minutes = TimeUnit.MILLISECONDS.toMinutes(clamped)
        val seconds = TimeUnit.MILLISECONDS.toSeconds(clamped) % 60
        Toast.makeText(
            this,
            "המתן $minutes:${seconds.toString().padStart(2, '0')} דקות לפני משלוח נוסף",
            Toast.LENGTH_LONG
        ).show()
    }

    private fun clearUserStateOnLogout() {
        contactedNumbers.clear()
        clearBulkQueue()
        replyMap.clear()
        isWhatsAppSendMode = false
        updateDeliveryButtonVisibility()
        updateSendModeToggle()
    }

    private fun showAlreadyRepliedInBulkFlash() {
        runOnUiThread {
            val flashAlert = findViewById<LinearLayout>(R.id.flashAlert)
            val tvMain = flashAlert.findViewById<TextView>(R.id.tvFlashMain)
            val tvSub = flashAlert.findViewById<TextView>(R.id.tvFlashSub)
            val tvExtra = flashAlert.findViewById<TextView>(R.id.tvFlashExtra)

            tvMain.text = "כבר התקבלה תשובה!"
            tvSub.text = "המספר לא נוסף לרשימה"
            tvExtra.text = "המשך לסרוק – רק חדשים יתווספו"

            flashHandler.removeCallbacks(hideFlashRunnable)
            flashAlert.visibility = View.VISIBLE
            playSound("confirmation")
            flashHandler.postDelayed(hideFlashRunnable, 2200)
        }
    }

    private fun resetScanState() {
        lastDetectedNumber = null
        confirmedNumber = null
        detectionCount = 0
        runOnUiThread {
            tvDetected.text = "סריקה..."
            tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
            scanOverlay.setActive(false)
        }
    }

    private fun normalizePhone(raw: String?): String? {
        if (raw == null) return null
        val s = raw.replace(Regex("[^0-9+]"), "")
        return when {
            // Israeli number with leading 0 (0526430819)
            s.startsWith("05") && s.length >= 10 -> "+972" + s.substring(1)
            // Israeli number without leading 0 (526430819 - 9 digits)
            s.startsWith("5") && s.length == 9 -> "+972" + s
            // Full international format (+972526430819)
            s.startsWith("+972") && s.length >= 13 -> s
            // International without + (972...)
            s.startsWith("972") && s.length >= 12 && !s.startsWith("+") -> {
                // Handle 9720526430819 issue - has extra 0
                if (s.startsWith("9720") && s.length == 13) {
                    // Remove the extra 0: 9720526430819 -> +972526430819
                    "+972" + s.substring(4)
                } else {
                    "+$s"
                }
            }
            else -> null
        }
    }

    private fun formatForDisplay(number: String): String {
        val local = if (number.startsWith("+972")) "0" + number.substring(4) else number
        return if (local.length == 10 && local.startsWith("05")) {
            "${local.substring(0, 3)}-${local.substring(3, 6)}-${local.substring(6)}"
        } else local
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

    private fun playSound(soundName: String) {
        try {
            mediaPlayer?.release()
            mediaPlayer = null
            val resId = resources.getIdentifier(soundName, "raw", packageName)
            if (resId != 0) {
                mediaPlayer = MediaPlayer.create(this, resId).apply {
                    setOnCompletionListener { it.release() }
                    start()
                }
            }
        } catch (e: Exception) {
            Log.w("Media", "$soundName failed", e)
        }
    }

    private fun showAlreadyRepliedFlash() {
        flashHandler.removeCallbacks(hideFlashRunnable)
        flashAlert.visibility = View.VISIBLE
        playSound("confirmation")
        flashHandler.postDelayed(hideFlashRunnable, 2000)
    }

    private fun sendSmsMessage(number: String, useCustomMessage: Boolean = false, forceEmptyBody: Boolean = false) {
        registerContact(number)
        val cleanPhone = number.replace("+", "")

        Handler(Looper.getMainLooper()).postDelayed({
            val finalMessage = if (!forceEmptyBody && useCustomMessage && etCustomMessage.text.toString().trim().isNotEmpty()) {
                etCustomMessage.text.toString().trim()
            } else if (!forceEmptyBody) {
                defaultMessage
            } else ""

            try {
                val smsIntent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$cleanPhone")).apply {
                    if (!forceEmptyBody && finalMessage.isNotEmpty()) {
                        putExtra("sms_body", finalMessage)
                    }
                }
                if (smsIntent.resolveActivity(packageManager) != null) {
                    startActivity(smsIntent)
                } else {
                    Toast.makeText(this, "No SMS app found", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this, "שגיאה: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }, 800)
    }

    private fun registerContact(rawNumber: String) {
        val normalized = normalizePhone(rawNumber) ?: rawNumber
        val local10 = toLocal10Digit(normalized)
        if (local10.isNotBlank()) {
            contactedNumbers.add(local10)
        }
        runOnUiThread { updateDeliveryButtonVisibility(); updateBulkSendButton() }
    }

    private fun openWhatsApp(number: String, includeBody: Boolean = true) {
        registerContact(number)
        val cleanNumber = number.replace(Regex("[^+0-9]"), "")
        val messageShouldInclude = includeBody && etCustomMessage.text.toString().trim().isNotEmpty()
        val finalMessage = if (messageShouldInclude) {
            etCustomMessage.text.toString().trim()
        } else defaultMessage

        val encodedMessage = if (includeBody) {
            try {
                URLEncoder.encode(finalMessage, "UTF-8")
            } catch (e: Exception) {
                finalMessage
            }
        } else ""

        val waNumber = when {
            cleanNumber.startsWith("+972") -> cleanNumber.removePrefix("+")
            cleanNumber.startsWith("0") -> "972" + cleanNumber.removePrefix("0")
            else -> cleanNumber
        }

        val uri = if (includeBody) {
            "https://wa.me/$waNumber?text=$encodedMessage"
        } else {
            "https://wa.me/$waNumber"
        }

        try {
            startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply { setPackage("com.whatsapp") }
            )
        } catch (e: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
        }
    }

    private fun SpannableStringBuilder.appendWithIcon(drawableRes: Int, text: String): SpannableStringBuilder {
        val drawable = ContextCompat.getDrawable(this@MainActivity, drawableRes)!!
        val size = (18 * resources.displayMetrics.density).toInt()
        drawable.setBounds(0, 0, size, size)
        val imageSpan = ImageSpan(drawable, ImageSpan.ALIGN_BASELINE)
        val start = this.length
        this.append(text)
        this.setSpan(imageSpan, start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return this
    }

    private fun buildInstructionText(reply: ReplyData): String {
        if (!reply.hasReplied) return ""

        var text = reply.rawSmsBody
        val removalPatterns = listOf(
            Regex("(?i)קוד(?:\\s*כניסה)?(?:\\s*מפתח)?\\s*[:：]?\\s*\\d+"),
            Regex("(?i)קומה\\s*[:：]?\\s*\\d+"),
            Regex("(?i)דירה\\s*[:：]?\\s*\\d+")
        )
        removalPatterns.forEach { pattern ->
            text = pattern.replace(text, "")
        }

        text = text.replace(Regex("\\s{2,}"), " ")

        val lines = text.split("\n", "\r")
            .map { it.trim().trim(',', '.', '-', ':') }
            .filter { it.isNotEmpty() }

        return lines.joinToString("\n")
    }

    private fun showDeliveryPopup(phone: String) {
        val clean = toLocal10Digit(phone)
        val reply = fetchLatestReply(clean)

        val sb = SpannableStringBuilder()
        sb.append("לקוח: ${formatForDisplay(phone)}\n\n")

        if (reply?.hasReplied == true) {
            if (reply.floor != null) sb.append("🏢 קומה: ${reply.floor}\n")
            if (reply.apartment != null) sb.append("🚪 דירה: ${reply.apartment}\n")

            if (reply.code != null) {
                val codeText = reply.code.trim()
                if (codeText.isNotEmpty()) {
                    sb.append("🔑 קוד: $codeText\n")
                }
            } else {
                sb.append("❌ לא צוין קוד\n")
            }
            sb.append("\n")

            val instructions = buildInstructionText(reply)
            if (instructions.isNotBlank()) {
                sb.append("──────────────\n")
                sb.append("📝 הערות:\n")
                sb.append(instructions)
                sb.append("\n──────────────")
            }
        } else {
            sb.append("⚠️ אין תגובה מהלקוח\n")
            sb.append("האם להשאיר בדלת?\n")
        }

        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog)
            .setTitle(if (reply?.hasReplied == true) "📦 פרטי משלוח" else "⚠️ אין תגובה")
            .setMessage(sb)
            .setPositiveButton("✅ אוקיי", null)
            .setNegativeButton(if (reply?.hasReplied != true) "❌ לא, לחזור" else null, null)
            .create()
        
        dialog.show()
        
        // Style the dialog for better appearance
        dialog.window?.setBackgroundDrawableResource(android.R.drawable.dialog_holo_dark_frame)
        // Fix button colors - make OK button white/light gray instead of purple
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#4CAF50"))
        }
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setTextColor(Color.parseColor("#F44336"))
    }

    private fun updateDeliveryButton() {
        btnDeliveryMode.text = if (isDeliveryMode) "במצב חלוקה" else "יציאה לדרך"
        val background = if (isDeliveryMode) R.drawable.bg_button_primary else R.drawable.bg_button_secondary
        styleButton(btnDeliveryMode, background, enabled = true)
    }

    private fun updateDeliveryButtonVisibility() {
        btnDeliveryMode.visibility = View.VISIBLE
    }

    private fun updateSendModeToggle() {
        if (isWhatsAppSendMode) {
            btnToggleSendMode.text = "מצב WhatsApp"
            styleButton(btnToggleSendMode, R.drawable.bg_button_accent, enabled = true)
            btnSend.text = "שלח WhatsApp"
            styleButton(btnSend, R.drawable.bg_button_accent, enabled = true)
        } else {
            btnToggleSendMode.text = "מצב SMS"
            styleButton(btnToggleSendMode, R.drawable.bg_button_secondary, enabled = true)
            btnSend.text = "שלח SMS"
            styleButton(btnSend, R.drawable.bg_button_primary, enabled = true)
        }
        updateBulkSendButton()
    }

    override fun onResume() {
        super.onResume()
        // Don't reset modes - they are now persisted
        // resetBulkMode() and exitBulkScanMode() removed to preserve state
        
        if (auth.currentUser == null) {
            startActivity(Intent(this, AuthActivity::class.java))
            finish()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            checkAccessAndStart()
        } else {
            requestPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    override fun onPause() {
        super.onPause()
        camera?.cameraControl?.enableTorch(false)
        // Save state when app goes to background
        saveScanState()
    }

    override fun onDestroy() {
        super.onDestroy()
        mediaPlayer?.release()
        cameraExecutor.shutdown()
        flashHandler.removeCallbacksAndMessages(null)
    }

    private fun saveScanState() {
        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean("isBulkScanMode", isBulkScanMode)
            putBoolean("isWhatsAppSendMode", isWhatsAppSendMode)
            putBoolean("isDeliveryMode", isDeliveryMode)
            apply()
        }
    }

    private fun restoreSavedState() {
        val prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE)
        isBulkScanMode = prefs.getBoolean("isBulkScanMode", false)
        isWhatsAppSendMode = prefs.getBoolean("isWhatsAppSendMode", false)
        isDeliveryMode = prefs.getBoolean("isDeliveryMode", false)
        
        // Update UI to reflect restored state
        if (isBulkScanMode) {
            isBulkMode = true
            updateBulkSendButton()
        }
        if (isDeliveryMode) {
            updateDeliveryButton()
        }
        updateSendModeToggle()
    }

    private fun showManualPhoneEntryDialog() {
        val input = EditText(this).apply {
            hint = "הזן מספר טלפון (לדוגמה: 0526430819)"
            inputType = android.text.InputType.TYPE_CLASS_PHONE
            layoutDirection = View.LAYOUT_DIRECTION_RTL
            textDirection = View.TEXT_DIRECTION_RTL
        }

        val dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog)
            .setTitle("📱 הזנת מספר ידנית")
            .setMessage("הזן מספר טלפון:")
            .setView(input)
            .setPositiveButton("✅ אישור") { _, _ ->
                val phoneNumber = input.text.toString().trim()
                val normalized = normalizePhone(phoneNumber)
                if (normalized != null) {
                    // Process as if scanned
                    confirmedNumber = normalized
                    val display = formatForDisplay(normalized)
                    tvDetected.text = display
                    tvDetected.setBackgroundResource(R.drawable.bg_detected_box)
                    playSound("beep")
                    
                    // Handle based on mode
                    val local10 = toLocal10Digit(normalized)
                    val reply = fetchLatestReply(local10)
                    addNumberToBulkQueue(local10, reply)
                    
                    Handler(Looper.getMainLooper()).postDelayed({
                        when {
                            isBulkScanMode -> {
                                if (reply?.apartment == null) {
                                    Toast.makeText(this, "נוסף: $display", Toast.LENGTH_SHORT).show()
                                } else {
                                    showAlreadyRepliedInBulkFlash()
                                }
                            }
                            isDeliveryMode -> {
                                showDeliveryPopup(normalized)
                            }
                            else -> {
                                if (reply?.apartment != null) {
                                    showAlreadyRepliedFlash()
                                } else {
                                    val useCustom = etCustomMessage.text.toString().trim().isNotEmpty()
                                    if (isWhatsAppSendMode) {
                                        openWhatsApp(normalized, includeBody = true)
                                    } else {
                                        sendSmsMessage(normalized, useCustom)
                                    }
                                }
                            }
                        }
                    }, 500)
                } else {
                    Toast.makeText(this, "מספר לא תקין", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("❌ ביטול", null)
            .create()

        dialog.show()
        // Fix button colors - make them white text instead of purple
        dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#4CAF50"))
        }
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#F44336"))
        }
    }
}
