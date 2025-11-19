package com.scan2chat.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.util.AttributeSet
import android.view.View

class ScanOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val windowRect = Rect()
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#80FF0000")
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density * 2
    }

    fun updateWindow(rect: Rect) {
        if (windowRect == rect) return
        windowRect.set(rect)
        invalidate()
    }

    fun setActive(active: Boolean) {
        borderPaint.color = if (active) {
            Color.parseColor("#8000FF00")
        } else {
            Color.parseColor("#80FF0000")
        }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (!windowRect.isEmpty) {
            canvas.drawRect(windowRect, borderPaint)
        }
    }
}
