package dev.detectvid.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.detectvid.mobile.data.DEFAULT_BASE_URL
import dev.detectvid.mobile.data.DetectVidApi
import dev.detectvid.mobile.data.LocalAnalysis
import dev.detectvid.mobile.data.LocalStore
import dev.detectvid.mobile.data.MobileState
import dev.detectvid.mobile.data.PickedImage
import dev.detectvid.mobile.data.SyncEngine
import dev.detectvid.mobile.data.SyncStatus
import dev.detectvid.mobile.data.createDetectVidHttpClient
import dev.detectvid.mobile.platform.AnalysisImagePreview
import dev.detectvid.mobile.platform.NativeMapPreview
import dev.detectvid.mobile.platform.platformHttpClient
import dev.detectvid.mobile.platform.rememberPhotoSource
import dev.detectvid.mobile.platform.rememberPlatformFileSystem
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val Vine950 = Color(0xFF052E16)
private val Vine900 = Color(0xFF14532D)
private val Vine800 = Color(0xFF166534)
private val Vine700 = Color(0xFF15803D)
private val Vine600 = Color(0xFF16A34A)
private val Vine400 = Color(0xFF4ADE80)
private val Vine100 = Color(0xFFDCFCE7)
private val Vine50 = Color(0xFFF0FDF4)
private val Slate900 = Color(0xFF111827)
private val Slate600 = Color(0xFF4B5563)
private val Slate100 = Color(0xFFF3F4F6)
private val BgDark = Color(0xFF030712)
private val CardDark = Color(0xFF111827)
private val BorderDark = Color(0xFF1F2937)

private data class AppColors(
    val background: Color,
    val card: Color,
    val text: Color,
    val muted: Color,
    val subtle: Color,
    val border: Color,
    val nav: Color,
)

private val LocalAppColors = staticCompositionLocalOf {
    AppColors(Vine50, Color.White, Slate900, Slate600, Slate100, Color(0xFFE5E7EB), Color.White)
}

private fun appColors(darkMode: Boolean): AppColors =
    if (darkMode) {
        AppColors(BgDark, CardDark, Color.White, Color(0xFF9CA3AF), Color(0xFF1F2937), BorderDark, Color(0xFF0F172A))
    } else {
        AppColors(Vine50, Color.White, Slate900, Slate600, Slate100, Color(0xFFE5E7EB), Color.White)
    }

@Composable
fun App() {
    MaterialTheme {
        val fileSystem = rememberPlatformFileSystem()
        val photoSource = rememberPhotoSource()
        val scope = rememberCoroutineScope()
        val store = remember(fileSystem) { LocalStore(fileSystem) }
        var state by remember { mutableStateOf(MobileState()) }
        var message by remember { mutableStateOf<String?>(null) }
        var working by remember { mutableStateOf(false) }
        var syncInProgress by remember { mutableStateOf(false) }
        var wasOffline by remember { mutableStateOf(false) }
        var capturedCookie by remember { mutableStateOf<String?>(null) }
        var selectedTab by remember { mutableStateOf(MobileTab.Dashboard) }
        var showCameraChoices by remember { mutableStateOf(false) }
        val colors = appColors(state.darkMode)

        val httpClient = remember { createDetectVidHttpClient(platformHttpClient()) }
        val api = remember(httpClient) {
            DetectVidApi(
                client = httpClient,
                getBaseUrl = { DEFAULT_BASE_URL },
                getAuthCookie = { state.authCookie },
                onAuthCookie = { capturedCookie = it },
            )
        }
        val syncEngine = remember(store, api) { SyncEngine(store, api) }

        suspend fun refreshState() {
            state = store.load()
        }

        suspend fun syncNow(showMessage: Boolean = true) {
            if (state.user == null || syncInProgress) return
            syncInProgress = true
            working = true
            if (showMessage) message = "Sincronizando datos del viñedo..."
            runCatching {
                state = syncEngine.syncAll { newState -> state = newState }
            }.onSuccess {
                if (showMessage || wasOffline) {
                    message = if (wasOffline) "Ahora tienes conexión. Sincronización completa." else "Sincronización completa."
                }
                wasOffline = false
            }.onFailure {
                wasOffline = true
                if (showMessage || message == null) {
                    message = "Estás sin conexión. Guardamos tus capturas para sincronizarlas después."
                }
            }
            working = false
            syncInProgress = false
        }

        suspend fun addImage(image: PickedImage?) {
            if (image == null) return
            working = true
            store.addImage(image)
            refreshState()
            message = "Captura guardada sin conexión. Se sincronizará cuando sea posible."
            working = false
            selectedTab = MobileTab.Captures
            if (state.user != null) syncNow(showMessage = false)
        }

        LaunchedEffect(Unit) {
            refreshState()
            if (state.user != null) syncNow(showMessage = false)
            while (true) {
                delay(30_000)
                if (state.user != null && !working) syncNow(showMessage = false)
            }
        }

        LaunchedEffect(message) {
            val visibleMessage = message
            if (visibleMessage != null) {
                delay(3_500)
                if (message == visibleMessage) message = null
            }
        }

        CompositionLocalProvider(LocalAppColors provides colors) {
        Surface(modifier = Modifier.fillMaxSize(), color = colors.background) {
            if (state.user == null) {
                UnauthenticatedScreen(
                    working = working,
                    message = message,
                    onLogin = { email, password ->
                        scope.launch {
                            working = true
                            message = null
                            runCatching { api.login(email, password) }
                                .onSuccess { response ->
                                    val user = response.user
                                    if (user != null) {
                                        state = store.saveSession(user, capturedCookie)
                                        message = "Bienvenido, ${user.name}"
                                        syncNow(showMessage = false)
                                    } else {
                                        message = response.message ?: "No se pudo iniciar sesión"
                                    }
                                }
                                .onFailure { message = it.message ?: "No se pudo iniciar sesión" }
                            working = false
                        }
                    },
                    onRegister = { name, email, password ->
                        scope.launch {
                            working = true
                            message = null
                            runCatching { api.register(name, email, password) }
                                .onSuccess { response ->
                                    val user = response.user
                                    if (user != null) {
                                        state = store.saveSession(user, capturedCookie)
                                        message = "Cuenta creada"
                                        syncNow(showMessage = false)
                                    } else {
                                        message = response.message ?: "No se pudo registrar la cuenta"
                                    }
                                }
                                .onFailure { message = it.message ?: "No se pudo registrar la cuenta" }
                            working = false
                        }
                    },
                )
            } else {
                Scaffold(
                    containerColor = colors.background,
                    bottomBar = {
                        BottomVineNavigation(
                            selectedTab = selectedTab,
                            working = working,
                            onTabSelected = { selectedTab = it },
                            onCamera = { showCameraChoices = true },
                        )
                    },
                ) { innerPadding ->
                    Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                        AuthenticatedScreen(
                            state = state,
                            working = working,
                            selectedTab = selectedTab,
                            onSync = { scope.launch { syncNow(showMessage = true) } },
                            onDeleteAnalysis = { id ->
                                scope.launch {
                                    state = store.deleteAnalysis(id)
                                    message = "Análisis eliminado. La sincronización actualizará la nube."
                                    syncNow(showMessage = false)
                                }
                            },
                            onPrimaryCapture = { showCameraChoices = true },
                            onOpenHistory = { selectedTab = MobileTab.Captures },
                            onOpenMap = { selectedTab = MobileTab.Map },
                            onLogout = {
                                scope.launch {
                                    state = store.clearSession()
                                    message = "Sesión cerrada"
                                    selectedTab = MobileTab.Dashboard
                                }
                            },
                            onDarkModeChanged = { enabled ->
                                scope.launch {
                                    state = store.updateDarkMode(enabled)
                                    message = if (enabled) "Modo oscuro activado" else "Modo claro activado"
                                }
                            },
                        )
                        MessageCard(message = message, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
                    }
                }
            }

            if (showCameraChoices) {
                CameraChoiceDialog(
                    working = working,
                    onDismiss = { showCameraChoices = false },
                    onTakePhoto = {
                        showCameraChoices = false
                        scope.launch { addImage(photoSource.takePhoto()) }
                    },
                    onImport = {
                        showCameraChoices = false
                        scope.launch { addImage(photoSource.pickImage()) }
                    },
                )
            }
        }
        }
    }
}

@Composable
private fun UnauthenticatedScreen(
    working: Boolean,
    message: String?,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            HeroHeader(userName = null, working = working)
            AuthCard(working = working, onLogin = onLogin, onRegister = onRegister)
        }
        MessageCard(message = message, modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp))
    }
}

@Composable
private fun AuthenticatedScreen(
    state: MobileState,
    working: Boolean,
    selectedTab: MobileTab,
    onSync: () -> Unit,
    onDeleteAnalysis: (String) -> Unit,
    onPrimaryCapture: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenMap: () -> Unit,
    onLogout: () -> Unit,
    onDarkModeChanged: (Boolean) -> Unit,
) {
    when (selectedTab) {
        MobileTab.Captures -> CapturesScreen(state = state, working = working, onSync = onSync, onDeleteAnalysis = onDeleteAnalysis)
        MobileTab.Dashboard -> DashboardScreen(state = state, onPrimaryCapture = onPrimaryCapture, onOpenHistory = onOpenHistory, onOpenMap = onOpenMap, onSync = onSync)
        MobileTab.Map -> MapScreen(state = state, onDeleteAnalysis = onDeleteAnalysis)
        MobileTab.Profile -> ProfileScreen(state = state, working = working, onSync = onSync, onLogout = onLogout, onDarkModeChanged = onDarkModeChanged)
    }
}

@Composable
private fun CapturesScreen(state: MobileState, working: Boolean, onSync: () -> Unit, onDeleteAnalysis: (String) -> Unit) {
    var groupMode by remember { mutableStateOf(HistoryGroup.Day) }
    val groups = remember(state.analyses, groupMode) { groupAnalyses(state.analyses, groupMode) }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { PageHeader("Historial de análisis", "Diagnósticos del viñedo, cola offline y capturas sincronizadas") }
        item { HistoryToolbar(state = state, working = working, groupMode = groupMode, onGroupMode = { groupMode = it }, onSync = onSync) }
        if (state.analyses.isEmpty()) {
            item { EmptyCapturesCard() }
        } else {
            groups.forEach { group ->
                item { SectionTitle(group.title, "${group.items.size} análisis") }
                items(group.items, key = { it.id }) { item -> HistoryAnalysisCard(item, onDelete = onDeleteAnalysis) }
            }
        }
    }
}

@Composable
private fun DashboardScreen(
    state: MobileState,
    onPrimaryCapture: () -> Unit,
    onOpenHistory: () -> Unit,
    onOpenMap: () -> Unit,
    onSync: () -> Unit,
) {
    val total = state.analyses.size
    val synced = state.analyses.count { it.status == SyncStatus.Synced }
    val pending = state.analyses.count { it.status in setOf(SyncStatus.Queued, SyncStatus.Failed) }
    val healthy = state.analyses.count { it.result?.result?.riskColor == "green" }
    val highRisk = state.analyses.count { it.result?.result?.riskLevel.equals("Alto", ignoreCase = true) || it.result?.result?.riskColor == "red" }
    val oidio = state.analyses.count { it.result?.result?.diseaseKey?.contains("powdery", ignoreCase = true) == true || it.result?.result?.disease?.contains("Oídio", ignoreCase = true) == true }
    val peronospora = state.analyses.count { it.result?.result?.diseaseKey?.contains("downy", ignoreCase = true) == true || it.result?.result?.disease?.contains("Peron", ignoreCase = true) == true }
    val latest = state.analyses.firstOrNull()
    val c = LocalAppColors.current

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { HeroHeader(userName = state.user?.name, working = false) }
        item { PageHeader("Panel", "Centro de control sanitario del viñedo") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("Análisis", total.toString(), "realizados", modifier = Modifier.weight(1f))
                MetricCard("Sanas", healthy.toString(), "hojas", modifier = Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MetricCard("Oídio", oidio.toString(), "detectado", modifier = Modifier.weight(1f))
                MetricCard("Peronóspora", peronospora.toString(), "detectado", modifier = Modifier.weight(1f))
            }
        }
        item {
            SectionTitle("Último análisis", "Resumen rápido del resultado más reciente")
        }
        item {
            if (latest != null) {
                HistoryAnalysisCard(latest, onDelete = {}, allowDelete = false)
            } else {
                EmptyStateCard("Aún no hay análisis", "Comenzá con una foto de campo para construir el historial del viñedo.", "Tomar foto", onPrimaryCapture)
            }
        }
        item { SectionTitle("Acciones rápidas", "Optimizadas para trabajo de campo") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                QuickActionCard("▣", "Tomar foto", "Cámara", onPrimaryCapture, Modifier.weight(1f))
                QuickActionCard("▤", "Historial", "$total registros", onOpenHistory, Modifier.weight(1f))
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                QuickActionCard("◇", "Ver mapa", "Zonas GPS", onOpenMap, Modifier.weight(1f))
                QuickActionCard("☁", "Sincronizar", "$pending pendientes", onSync, Modifier.weight(1f))
            }
        }
        item {
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Presión de enfermedad", fontWeight = FontWeight.Bold, color = c.text)
                    DiseaseBar(label = "Riesgo alto", value = highRisk, total = total, color = Color(0xFFDC2626))
                    DiseaseBar(label = "Sanas", value = healthy, total = total, color = Vine600)
                    DiseaseBar(label = "Pendiente de sincronización", value = pending, total = total, color = Color(0xFFD97706))
                    Text(
                        "La analítica completa podrá conectarse a métricas del backend. Esta vista resume datos locales y sincronizados.",
                        color = c.muted,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun MapScreen(state: MobileState, onDeleteAnalysis: (String) -> Unit) {
    val gpsItems = state.analyses.filter { it.latitude != null && it.longitude != null }
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { PageHeader("Mapa del viñedo", "Vista de mapa con zonas de análisis GPS") }
        item {
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    NativeMapPreview(
                        analyses = state.analyses,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                            .clip(RoundedCornerShape(24.dp)),
                    )
                    MapLegend()
                    Text(
                        "El dibujo de fincas sigue disponible en la web. En mobile se muestran el mapa y las zonas GPS manteniendo la sincronización.",
                        color = Slate600,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        items(gpsItems, key = { it.id }) { HistoryAnalysisCard(it, onDelete = onDeleteAnalysis) }
    }
}

@Composable
private fun ProfileScreen(
    state: MobileState,
    working: Boolean,
    onSync: () -> Unit,
    onLogout: () -> Unit,
    onDarkModeChanged: (Boolean) -> Unit,
) {
    val c = LocalAppColors.current
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item { PageHeader("Perfil", "Cuenta, sincronización y almacenamiento offline") }
        item {
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BrandMark(Modifier.size(52.dp))
                        Column {
                            Text(state.user?.name.orEmpty(), color = c.text, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                            Text(state.user?.email.orEmpty(), color = c.muted)
                        }
                    }
                    Text("El servidor se gestiona automáticamente en esta versión.", color = c.muted, style = MaterialTheme.typography.bodySmall)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Modo oscuro", color = c.text, fontWeight = FontWeight.SemiBold)
                            Text("Usa el estilo premium del panel web.", color = c.muted, style = MaterialTheme.typography.bodySmall)
                        }
                        Switch(checked = state.darkMode, onCheckedChange = onDarkModeChanged)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = onSync, enabled = !working, modifier = Modifier.weight(1f)) { Text("Sincronizar") }
                        OutlinedButton(onClick = onLogout, enabled = !working, modifier = Modifier.weight(1f)) { Text("Cerrar sesión") }
                    }
                }
            }
        }
        item {
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Primero offline", color = c.text, fontWeight = FontWeight.Bold)
                    Text("Las fotos se guardan primero localmente, luego se analizan y sincronizan cuando hay sesión y conexión.", color = c.muted)
                }
            }
        }
    }
}

@Composable
private fun HeroHeader(userName: String?, working: Boolean) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(28.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.linearGradient(listOf(Vine950, Vine800, Vine600)))
                .padding(22.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(end = 44.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    BrandMark(Modifier.size(48.dp))
                    BrandWordmark()
                }
                Text(
                    userName?.let { "Buen trabajo de campo, $it" } ?: "Sanidad del viñedo con IA",
                    color = Vine100,
                    style = MaterialTheme.typography.titleMedium,
                )
                Text("Capturá hojas, seguí trabajando offline y sincronizá diagnósticos desde el campo.", color = Color(0xFFD1FAE5))
            }
            if (working) CircularProgressIndicator(modifier = Modifier.size(30.dp).align(Alignment.TopEnd), color = Color.White)
        }
    }
}

@Composable
private fun BrandWordmark() {
    Row(verticalAlignment = Alignment.Bottom) {
        Text("Detect", color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.headlineSmall)
        Text("VID", color = Vine400, fontWeight = FontWeight.Black, style = MaterialTheme.typography.headlineSmall)
    }
}

@Composable
private fun BrandMark(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(Color(0xFF0B7A3B), Color(0xFF059669)))),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(28.dp)) {
            val stroke = 2.7.dp.toPx()
            drawOval(
                color = Color.White,
                topLeft = androidx.compose.ui.geometry.Offset(size.width * 0.18f, size.height * 0.10f),
                size = androidx.compose.ui.geometry.Size(size.width * 0.64f, size.height * 0.76f),
                style = Stroke(stroke),
            )
            drawLine(
                color = Color.White,
                start = androidx.compose.ui.geometry.Offset(size.width * 0.18f, size.height * 0.78f),
                end = androidx.compose.ui.geometry.Offset(size.width * 0.82f, size.height * 0.24f),
                strokeWidth = stroke,
            )
        }
    }
}


@Composable
private fun PageHeader(title: String, subtitle: String) {
    val c = LocalAppColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.headlineSmall, color = c.text)
        Text(subtitle, color = c.muted, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun CaptureSummaryCard(state: MobileState, working: Boolean, onSync: () -> Unit) {
    val pending = state.analyses.count { it.status in setOf(SyncStatus.Queued, SyncStatus.Failed) }
    val synced = state.analyses.count { it.status == SyncStatus.Synced }
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Cola de capturas", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text("$pending pendientes · $synced sincronizados", color = LocalAppColors.current.muted)
                }
                Button(onClick = onSync, enabled = !working) { Text("Sincronizar") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                MiniStat("Pendientes", pending.toString(), Modifier.weight(1f))
                MiniStat("Sincronizados", synced.toString(), Modifier.weight(1f))
                MiniStat("Total", state.analyses.size.toString(), Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun AuthCard(
    working: Boolean,
    onLogin: (String, String) -> Unit,
    onRegister: (String, String, String) -> Unit,
) {
    val c = LocalAppColors.current
    var mode by remember { mutableStateOf(AuthMode.Login) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(if (mode == AuthMode.Login) "Iniciar sesión" else "Crear cuenta", color = c.text, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
            if (mode == AuthMode.Register) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Nombre") }, modifier = Modifier.fillMaxWidth(), singleLine = true, colors = detectVidTextFieldColors())
            }
            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Correo") }, modifier = Modifier.fillMaxWidth(), singleLine = true, colors = detectVidTextFieldColors())
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Contraseña") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = detectVidTextFieldColors(),
            )
            Button(
                onClick = { if (mode == AuthMode.Login) onLogin(email, password) else onRegister(name, email, password) },
                enabled = !working && email.isNotBlank() && password.isNotBlank() && (mode == AuthMode.Login || name.isNotBlank()),
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = Vine700),
            ) { Text(if (mode == AuthMode.Login) "Iniciar sesión" else "Crear cuenta") }
            TextButton(onClick = { mode = if (mode == AuthMode.Login) AuthMode.Register else AuthMode.Login }) {
                Text(if (mode == AuthMode.Login) "¿No tenés cuenta?" else "¿Ya tenés cuenta?", color = Vine400)
            }
        }
    }
}

@Composable
private fun detectVidTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = LocalAppColors.current.text,
    unfocusedTextColor = LocalAppColors.current.text,
    focusedLabelColor = Vine400,
    unfocusedLabelColor = LocalAppColors.current.muted,
    focusedBorderColor = Vine700,
    unfocusedBorderColor = LocalAppColors.current.border,
    cursorColor = Vine400,
    focusedContainerColor = LocalAppColors.current.subtle,
    unfocusedContainerColor = LocalAppColors.current.subtle,
)

@Composable
private fun HistoryToolbar(
    state: MobileState,
    working: Boolean,
    groupMode: HistoryGroup,
    onGroupMode: (HistoryGroup) -> Unit,
    onSync: () -> Unit,
) {
    val pending = state.analyses.count { it.status in setOf(SyncStatus.Queued, SyncStatus.Failed) }
    val synced = state.analyses.count { it.status == SyncStatus.Synced }
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Historial", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                    Text("${state.analyses.size} total · $pending pendientes · $synced sincronizados", color = LocalAppColors.current.muted)
                }
                StatusChip("${state.analyses.size}", Vine700)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                HistoryTab("Por día", selected = groupMode == HistoryGroup.Day, onClick = { onGroupMode(HistoryGroup.Day) }, modifier = Modifier.weight(1f))
                HistoryTab("Por semana", selected = groupMode == HistoryGroup.Week, onClick = { onGroupMode(HistoryGroup.Week) }, modifier = Modifier.weight(1f))
                HistoryTab("Por mes", selected = groupMode == HistoryGroup.Month, onClick = { onGroupMode(HistoryGroup.Month) }, modifier = Modifier.weight(1f))
            }
            Button(onClick = onSync, enabled = !working, colors = ButtonDefaults.buttonColors(containerColor = Vine700), modifier = Modifier.fillMaxWidth()) {
                Text("Sincronizar historial")
            }
        }
    }
}

@Composable
private fun HistoryTab(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalAppColors.current
    Text(
        text = label,
        color = if (selected) Color.White else c.muted,
        fontWeight = FontWeight.SemiBold,
        style = MaterialTheme.typography.labelMedium,
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (selected) Vine700 else c.subtle)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 9.dp),
    )
}

@Composable
private fun HistoryAnalysisCard(item: LocalAnalysis, onDelete: (String) -> Unit, allowDelete: Boolean = true) {
    val c = LocalAppColors.current
    var showPhoto by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val result = item.result?.result
    val statusColor = when (item.status) {
        SyncStatus.Synced -> Vine700
        SyncStatus.Failed -> Color(0xFFB42318)
        SyncStatus.Queued -> Color(0xFFB45309)
        SyncStatus.Analyzing, SyncStatus.Syncing -> Color(0xFF2563EB)
    }
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = c.card, contentColor = c.text),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth().border(1.dp, c.border, RoundedCornerShape(24.dp)),
    ) {
        Row(modifier = Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AnalysisImagePreview(
                localImagePath = item.localImagePath,
                remoteImageUrl = item.remoteImageUrl,
                contentDescription = result?.disease ?: item.fileName,
                modifier = Modifier
                    .size(88.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .clickable { showPhoto = true },
            )
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        result?.disease ?: item.fileName,
                        modifier = Modifier.weight(1f),
                        fontWeight = FontWeight.Bold,
                        color = c.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    RiskPill(result?.riskLevel ?: item.status.name, result?.riskColor, statusColor)
                }
                Text(formatHistoryDate(item.createdAt), color = c.muted, style = MaterialTheme.typography.bodySmall)
                result?.let {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${it.confidence}% confianza", fontWeight = FontWeight.SemiBold, color = Vine800, style = MaterialTheme.typography.bodySmall)
                        StatusChip(item.status.name, statusColor)
                    }
                    Text(it.recommendation, style = MaterialTheme.typography.bodySmall, color = c.muted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                } ?: run {
                    StatusChip(item.status.name, statusColor)
                    Text("Esperando análisis", color = c.muted, style = MaterialTheme.typography.bodySmall)
                }
                if (item.latitude != null && item.longitude != null) {
                    Text("GPS ${item.latitude.formatCoord()}, ${item.longitude.formatCoord()}", style = MaterialTheme.typography.labelSmall, color = Vine700, fontWeight = FontWeight.SemiBold)
                }
                item.errorMessage?.let { Text(it, color = Color(0xFFB42318), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                if (allowDelete) TextButton(onClick = { confirmDelete = true }) { Text("Eliminar") }
            }
        }
    }

    if (showPhoto) {
        AlertDialog(
            onDismissRequest = { showPhoto = false },
            title = { Text(result?.disease ?: "Foto de captura") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AnalysisImagePreview(
                        localImagePath = item.localImagePath,
                        remoteImageUrl = item.remoteImageUrl,
                        contentDescription = result?.disease ?: item.fileName,
                        modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(22.dp)),
                    )
                    Text(formatHistoryDate(item.createdAt), color = c.muted)
                    result?.let { StatusChip("${it.confidence}% confianza", Vine700) }
                }
            },
            confirmButton = { TextButton(onClick = { showPhoto = false }) { Text("Cerrar") } },
            shape = RoundedCornerShape(24.dp),
        )
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("¿Eliminar análisis?") },
            text = { Text("Se elimina localmente ahora y se sincroniza el borrado con la nube cuando sea posible.") },
            confirmButton = {
                Button(onClick = { confirmDelete = false; onDelete(item.id) }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626))) {
                    Text("Eliminar")
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancelar") } },
            shape = RoundedCornerShape(24.dp),
        )
    }
}

@Composable
private fun BottomVineNavigation(selectedTab: MobileTab, working: Boolean, onTabSelected: (MobileTab) -> Unit, onCamera: () -> Unit) {
    val c = LocalAppColors.current
    Box(modifier = Modifier.fillMaxWidth()) {
        NavigationBar(containerColor = c.nav, tonalElevation = 12.dp) {
            BottomItem(MobileTab.Dashboard, selectedTab, "Panel", "⌂", onTabSelected, Modifier.weight(1f))
            BottomItem(MobileTab.Captures, selectedTab, "Historial", "▣", onTabSelected, Modifier.weight(1f))
            Spacer(modifier = Modifier.weight(1f))
            BottomItem(MobileTab.Map, selectedTab, "Mapa", "◇", onTabSelected, Modifier.weight(1f))
            BottomItem(MobileTab.Profile, selectedTab, "Perfil", "👤", onTabSelected, Modifier.weight(1f))
        }
        Button(
            onClick = onCamera,
            enabled = !working,
            shape = CircleShape,
            colors = ButtonDefaults.buttonColors(containerColor = Vine700),
            modifier = Modifier.align(Alignment.TopCenter).padding(top = 4.dp).size(64.dp),
            contentPadding = ButtonDefaults.ContentPadding,
        ) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CameraGlyph(modifier = Modifier.size(29.dp))
            }
        }
    }
}

@Composable
private fun CameraGlyph(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val stroke = 2.4.dp.toPx()
        drawRoundRect(
            color = Color.White,
            topLeft = androidx.compose.ui.geometry.Offset(size.width * 0.12f, size.height * 0.28f),
            size = androidx.compose.ui.geometry.Size(size.width * 0.76f, size.height * 0.58f),
            cornerRadius = CornerRadius(6.dp.toPx(), 6.dp.toPx()),
            style = Stroke(stroke),
        )
        drawRoundRect(
            color = Color.White,
            topLeft = androidx.compose.ui.geometry.Offset(size.width * 0.31f, size.height * 0.15f),
            size = androidx.compose.ui.geometry.Size(size.width * 0.38f, size.height * 0.18f),
            cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
            style = Stroke(stroke),
        )
        drawCircle(color = Color.White, radius = size.minDimension * 0.17f, center = center, style = Stroke(stroke))
    }
}

@Composable
private fun BottomItem(
    tab: MobileTab,
    selectedTab: MobileTab,
    label: String,
    icon: String,
    onTabSelected: (MobileTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val selected = selectedTab == tab
    val c = LocalAppColors.current
    Column(
        modifier = modifier
            .height(72.dp)
            .clickable { onTabSelected(tab) }
            .padding(top = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(icon, color = if (selected) Vine700 else c.muted, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleLarge)
        Text(
            label,
            color = if (selected) Vine700 else c.muted,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
        )
    }
}

@Composable
private fun CameraChoiceDialog(working: Boolean, onDismiss: () -> Unit, onTakePhoto: () -> Unit, onImport: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Agregar captura") },
        text = { Text("Tomá una foto del viñedo o importá una imagen existente del dispositivo.") },
        confirmButton = { Button(onClick = onTakePhoto, enabled = !working) { Text("Tomar foto") } },
        dismissButton = { OutlinedButton(onClick = onImport, enabled = !working) { Text("Importar imagen") } },
        shape = RoundedCornerShape(24.dp),
    )
}

@Composable
private fun PremiumCard(content: @Composable () -> Unit) {
    val c = LocalAppColors.current
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = c.card, contentColor = c.text),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        modifier = Modifier.fillMaxWidth().border(1.dp, c.border, RoundedCornerShape(24.dp)),
    ) {
        Box(modifier = Modifier.padding(16.dp)) { content() }
    }
}

@Composable
private fun MetricCard(label: String, value: String, detail: String, modifier: Modifier = Modifier) {
    val c = LocalAppColors.current
    Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = c.card, contentColor = c.text), modifier = modifier.border(1.dp, c.border, RoundedCornerShape(22.dp))) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black, color = Vine800)
            Text(label, fontWeight = FontWeight.SemiBold, color = c.text)
            Text(detail, color = c.muted, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun MiniStat(label: String, value: String, modifier: Modifier = Modifier) {
    val c = LocalAppColors.current
    Column(
        modifier = modifier.clip(RoundedCornerShape(18.dp)).background(c.subtle).padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, fontWeight = FontWeight.Black, color = Vine800)
        Text(label, color = c.muted, style = MaterialTheme.typography.labelSmall)
    }
}

@Composable
private fun QuickActionCard(icon: String, title: String, subtitle: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val c = LocalAppColors.current
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = c.card, contentColor = c.text),
        modifier = modifier.border(1.dp, c.border, RoundedCornerShape(18.dp)).clickable { onClick() },
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(
                modifier = Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Vine700.copy(alpha = 0.22f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(icon, color = Vine400, fontWeight = FontWeight.Black)
            }
            Text(title, fontWeight = FontWeight.Bold, color = c.text, maxLines = 1)
            Text(subtitle, color = c.muted, style = MaterialTheme.typography.labelSmall, maxLines = 1)
        }
    }
}

@Composable
private fun EmptyStateCard(title: String, body: String, action: String, onAction: () -> Unit) {
    val c = LocalAppColors.current
    PremiumCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            BrandMark(Modifier.size(54.dp))
            Text(title, color = c.text, fontWeight = FontWeight.Bold)
            Text(body, color = c.muted, style = MaterialTheme.typography.bodySmall)
            Button(onClick = onAction, colors = ButtonDefaults.buttonColors(containerColor = Vine700), modifier = Modifier.fillMaxWidth()) {
                Text(action)
            }
        }
    }
}

@Composable
private fun DiseaseBar(label: String, value: Int, total: Int, color: Color) {
    val fraction = if (total == 0) 0f else value.toFloat() / total.toFloat()
    val c = LocalAppColors.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row {
            Text(label, modifier = Modifier.weight(1f), color = c.muted)
            Text(value.toString(), color = c.muted)
        }
        Box(modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(999.dp)).background(c.subtle)) {
            Box(modifier = Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(10.dp).background(color))
        }
    }
}

@Composable
private fun StatusChip(text: String, color: Color) {
    Text(
        text = text,
        color = color,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(color.copy(alpha = 0.10f)).padding(horizontal = 10.dp, vertical = 5.dp),
    )
}

@Composable
private fun RiskPill(text: String, riskColor: String?, fallback: Color) {
    val color = when (riskColor?.lowercase()) {
        "green" -> Vine700
        "yellow" -> Color(0xFFD97706)
        "red" -> Color(0xFFDC2626)
        else -> fallback
    }
    StatusChip(text, color)
}

@Composable
private fun MapLegend() {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        LegendChip("Enfermedad", Color(0xFFEF4444), Modifier.weight(1f))
        LegendChip("Sanas", Vine600, Modifier.weight(1f))
        LegendChip("Moderado", Color(0xFFF59E0B), Modifier.weight(1f))
    }
}

@Composable
private fun LegendChip(label: String, color: Color, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.clip(RoundedCornerShape(999.dp)).background(color.copy(alpha = 0.10f)).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(modifier = Modifier.size(9.dp).clip(CircleShape).background(color))
        Text(label, color = color, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1)
    }
}

private fun formatHistoryDate(value: String): String {
    val normalized = normalizeDateParts(value) ?: return "Fecha no disponible"
    return "${normalized.time} · ${normalized.day}/${normalized.month}/${normalized.year}"
}

private data class DateParts(val year: String, val month: String, val day: String, val time: String) {
    val isoDate: String = "$year-$month-$day"
}

private fun normalizeDateParts(value: String): DateParts? {
    val cleaned = value.trim()
    if (cleaned.length < 10) return null
    val date = cleaned.take(10)
    if (date.length != 10 || date[4] != '-' || date[7] != '-') return null
    val timeStart = cleaned.drop(10).trimStart('T', ' ')
    val time = timeStart.take(5).takeIf { it.length == 5 && it[2] == ':' } ?: "--:--"
    return DateParts(
        year = date.substring(0, 4),
        month = date.substring(5, 7),
        day = date.substring(8, 10),
        time = time,
    )
}

private fun Double.formatCoord(): String = toString().take(9)

private data class HistoryBucket(val title: String, val items: List<LocalAnalysis>)

private fun groupAnalyses(items: List<LocalAnalysis>, mode: HistoryGroup): List<HistoryBucket> =
    items.groupBy { item ->
        val date = normalizeDateParts(item.createdAt)
        when (mode) {
            HistoryGroup.Day -> date?.isoDate ?: "Fecha no disponible"
            HistoryGroup.Week -> date?.let { "Semana ${it.year}-${it.month}" } ?: "Fecha no disponible"
            HistoryGroup.Month -> date?.let { "${it.year}-${it.month}" } ?: "Fecha no disponible"
        }
    }.map { (key, grouped) ->
        HistoryBucket(
            title = when (mode) {
                HistoryGroup.Day -> key
                HistoryGroup.Week -> key
                HistoryGroup.Month -> "Mes $key"
            },
            items = grouped,
        )
    }

@Composable
private fun SectionTitle(title: String, subtitle: String) {
    val c = LocalAppColors.current
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, fontWeight = FontWeight.Bold, color = c.text)
        Text(subtitle, color = c.muted, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun EmptyCapturesCard() {
    val c = LocalAppColors.current
    PremiumCard {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            BrandMark(Modifier.size(50.dp))
            Text("Aún no hay capturas", fontWeight = FontWeight.Bold, color = c.text)
            Text("Usá la cámara central para empezar a analizar hojas de vid.", color = c.muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun VineyardInfoCard() {
    val c = LocalAppColors.current
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Diseñada para el viñedo", fontWeight = FontWeight.Bold, color = c.text)
            Text("Lenguaje visual verde, cola offline y sincronización cloud listas para Android e iOS desde Compose compartido.", color = c.muted)
        }
    }
}

@Composable
private fun VineyardRows() {
    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 36.dp, vertical = 54.dp), verticalArrangement = Arrangement.SpaceEvenly) {
        repeat(6) {
            Box(modifier = Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(999.dp)).background(Color.White.copy(alpha = 0.22f)))
        }
    }
}

@Composable
private fun MessageCard(message: String?, modifier: Modifier = Modifier) {
    if (message == null) return
    Card(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Slate900),
        shape = RoundedCornerShape(18.dp),
    ) {
        Text(text = message, modifier = Modifier.padding(14.dp), color = Color.White, style = MaterialTheme.typography.bodyMedium)
    }
}

private enum class MobileTab { Captures, Dashboard, Map, Profile }
private enum class AuthMode { Login, Register }
private enum class HistoryGroup { Day, Week, Month }
