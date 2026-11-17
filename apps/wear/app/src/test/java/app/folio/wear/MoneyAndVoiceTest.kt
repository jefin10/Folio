package app.folio.wear

import app.folio.wear.data.Money
import app.folio.wear.data.VoiceParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MoneyAndVoiceTest {
    @Test fun parsesExactPaise() {
        assertEquals(12_345_678L, Money.parse("₹1,23,456.78"))
        assertEquals(10L, Money.parse("0.1"))
        assertEquals(150_000L, Money.parse("1.5k"))
        assertEquals(2_00_000_00L, Money.parse("2L"))
        assertNull(Money.parse("1.234"))
        assertNull(Money.parse("abc"))
        assertNull(Money.parse(""))
    }

    @Test fun formatsIndianGrouping() {
        assertEquals("₹1,23,45,678", Money.format(12_345_678_00L))
        assertEquals("₹1,23,456.78", Money.format(12_345_678L, decimals = true))
        assertEquals("−₹5,000", Money.format(-5_000_00L))
        assertEquals("₹1.29L", Money.compact(1_29_999_00L))
        assertEquals("₹12.4K", Money.compact(12_499_00L))
    }

    @Test fun parsesVoiceLikeCore() {
        val p = VoiceParser.parse("10000 household groceries on elite, parents owe 7000", listOf("SBI ELITE"))
        assertEquals(10_000_00L, p.amountPaise)
        assertEquals("elite", p.accountHint)
        assertEquals("parents", p.personHint)
        assertEquals(7_000_00L, p.personSharePaise)

        val q = VoiceParser.parse("spent 1.2k on dinner split with rahul")
        assertEquals(1_200_00L, q.amountPaise)
        assertEquals("Dinner", q.description)
        assertEquals(600_00L, q.personSharePaise)
        assertNull(q.accountHint)

        assertEquals("hdfc", VoiceParser.parse("uber 340 paid by hdfc").accountHint)
    }
}
