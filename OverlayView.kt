package com.scan2chat.app

import android.content.Context
import android.graphics.Canvas
import android.util.AttributeSet
import android.view.View

class OverlayView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null, defStyle: Int = 0
) : View(context, attrs, defStyle) {

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        // placeholder overlay - your drawing logic can go here
    }
}
