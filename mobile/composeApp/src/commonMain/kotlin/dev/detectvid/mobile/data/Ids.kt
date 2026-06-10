package dev.detectvid.mobile.data

import dev.detectvid.mobile.platform.currentTimeMillis
import kotlin.random.Random

fun randomId(): String = buildString {
    append(currentTimeMillis().toString(36).uppercase())
    append('-')
    repeat(6) { append("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Random.nextInt(36)]) }
}
