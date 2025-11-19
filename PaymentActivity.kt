package com.scan2chat.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.paypal.checkout.PayPalCheckout
import com.paypal.checkout.approve.OnApprove
import com.paypal.checkout.cancel.OnCancel
import com.paypal.checkout.config.CheckoutConfig
import com.paypal.checkout.config.Environment
import com.paypal.checkout.createorder.*
import com.paypal.checkout.error.OnError
import com.paypal.checkout.order.*
import com.paypal.checkout.paymentbutton.PayPalButton

class PaymentActivity : AppCompatActivity() {

    private lateinit var btnOneTime: Button
    private lateinit var btn30Day: Button
    private lateinit var payPalButton: PayPalButton
    private lateinit var btnLogoutPayment: Button

    private val auth = FirebaseAuth.getInstance()
    private val db = FirebaseFirestore.getInstance()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_payment)

        btnOneTime = findViewById(R.id.btnOneTime)
        btn30Day = findViewById(R.id.btn30Day)
        payPalButton = findViewById(R.id.payPalButton)
        btnLogoutPayment = findViewById(R.id.btnLogoutPayment)

        // === כפתור התנתק – פשוט, מעביר ל-AuthActivity ===
        btnLogoutPayment.setOnClickListener {
            FirebaseAuth.getInstance().signOut()

            // נקה רק את התנאים – לא מוחקים נתוני משלוחים
            val prefs = getSharedPreferences("Scan2ChatPrefs", Context.MODE_PRIVATE)
            prefs.edit().remove("terms_accepted").apply()

            val intent = Intent(this, AuthActivity::class.java)
            intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            startActivity(intent)
            finish()
        }

        PayPalCheckout.setConfig(
            CheckoutConfig(
                application = application,
                clientId = "AS0avWmqKfgJgwHe4ns2c1oNOvfVmKO93DKksxWj1J0KqAKtCCzuUOgKfuVMpJ7IXsSOgXlSDCjaE77W",
                environment = Environment.LIVE,
                returnUrl = "com.scan2chat.app://paypalpay"
            )
        )

        btnOneTime.setOnClickListener { startPayment("400.00", true) }
        btn30Day.setOnClickListener { startPayment("40.00", false) }

        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val uri: Uri? = intent?.data
        if (uri?.toString()?.startsWith("com.scan2chat.app://paypalpay") == true) {
            Toast.makeText(this, "תשלום התקבל! מעבד...", Toast.LENGTH_LONG).show()
            payPalButton.visibility = View.VISIBLE
        }
    }

    private fun startPayment(amount: String, isLifetime: Boolean) {
        payPalButton.visibility = View.VISIBLE

        payPalButton.setup(
            createOrder = CreateOrder { actions ->
                actions.create(
                    OrderRequest(
                        intent = OrderIntent.CAPTURE,
                        appContext = AppContext(userAction = UserAction.PAY_NOW),
                        purchaseUnitList = listOf(
                            PurchaseUnit(
                                amount = Amount(CurrencyCode.ILS, amount)
                            )
                        )
                    )
                )
            },
            onApprove = OnApprove { approval ->
                approval.orderActions.capture {
                    Toast.makeText(this, "תשלום הצליח!", Toast.LENGTH_LONG).show()
                    saveToFirebase(isLifetime)
                }
            },
            onCancel = OnCancel {
                Toast.makeText(this, "בוטל", Toast.LENGTH_SHORT).show()
            },
            onError = OnError {
                Toast.makeText(this, "שגיאת PayPal — נסה שוב", Toast.LENGTH_LONG).show()
            }
        )

        Handler(Looper.getMainLooper()).postDelayed({
            payPalButton.performClick()
        }, 200)
    }

    private fun saveToFirebase(isLifetime: Boolean) {
        val uid = auth.currentUser?.uid ?: return
        val expire = if (isLifetime) Long.MAX_VALUE else System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000
        val data = mapOf("lifetime" to isLifetime, "expires_at" to expire)

        db.collection("users").document(uid)
            .set(data, SetOptions.merge())
            .addOnSuccessListener {
                val prefs = getSharedPreferences("Scan2ChatPrefs", Context.MODE_PRIVATE)
                prefs.edit()
                    .putBoolean("lifetime", isLifetime)
                    .putLong("expires_at", expire)
                    .apply()

                Toast.makeText(this, if (isLifetime) "גישה נפתחה לתמיד!" else "גישה ל-30 יום!", Toast.LENGTH_LONG).show()

                val intent = Intent(this, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
            }
            .addOnFailureListener {
                Toast.makeText(this, "שמירה נכשלה — גישה מקומית פעילה!", Toast.LENGTH_LONG).show()
                val intent = Intent(this, MainActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
            }
    }
}