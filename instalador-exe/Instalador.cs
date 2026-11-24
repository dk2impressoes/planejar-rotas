// © 2026 Grupo DK² — Planejar Rotas com Checklist. Forjada para programar o futuro.
// Planejar Rotas com Checklist — instalador .exe (sem administrador).
// O pacote do Windows (app + scripts) vai embutido como recurso "pacote.zip".
// O .exe extrai numa pasta temporária, roda instalar.ps1 e mostra o resultado.
// Opções (para testes): /destino:<pasta> /semAtalhos /semAbrir /semRegistro /silencioso
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Planejar Rotas - Instalador")]
[assembly: AssemblyProduct("Planejar Rotas com Checklist")]
[assembly: AssemblyCompany("Grupo DK2")]
[assembly: AssemblyCopyright("(c) 2026 Grupo DK2")]
[assembly: AssemblyVersion("13.0.0.0")]
[assembly: AssemblyFileVersion("13.0.0.0")]

static class Instalador
{
    const string Titulo = "Planejar Rotas - Instalação";

    [STAThread]
    static int Main(string[] args)
    {
        string destino = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PlanejarRotas");
        bool semAtalhos = false, semAbrir = false, semRegistro = false, silencioso = false;
        foreach (string a in args)
        {
            string x = a.ToLowerInvariant();
            if (x.StartsWith("/destino:")) { destino = Path.GetFullPath(a.Substring(9)); semRegistro = true; }
            else if (x == "/sematalhos") semAtalhos = true;
            else if (x == "/semabrir") semAbrir = true;
            else if (x == "/semregistro") semRegistro = true;
            else if (x == "/silencioso") silencioso = true;
        }

        if (!silencioso)
        {
            var r = MessageBox.Show(
                "Instalar o Planejar Rotas com Checklist neste computador?\n\n" +
                "• Não precisa de administrador.\n" +
                "• Cria o atalho \"Planejar Rotas\" na Área de Trabalho e no menu Iniciar.\n" +
                "• Suas viagens já salvas não são apagadas.",
                Titulo, MessageBoxButtons.YesNo, MessageBoxIcon.Question);
            if (r != DialogResult.Yes) return 1;
        }

        string temp = Path.Combine(Path.GetTempPath(), "PlanejarRotas-instalador-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(temp);
            string zip = Path.Combine(temp, "pacote.zip");
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream("pacote.zip"))
            using (FileStream f = File.Create(zip)) { s.CopyTo(f); }
            string pasta = Path.Combine(temp, "pacote");
            ZipFile.ExtractToDirectory(zip, pasta);

            string argumentos = "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(pasta, "instalar.ps1") + "\"" +
                " -Destino \"" + destino + "\" -SemAbrir" + (semAtalhos ? " -SemAtalhos" : "");
            var psi = new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"), argumentos)
            {
                UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            string saida, erros;
            int codigo;
            using (Process p = Process.Start(psi))
            {
                var tErr = p.StandardError.ReadToEndAsync();
                saida = p.StandardOutput.ReadToEnd();
                erros = tErr.Result;
                p.WaitForExit();
                codigo = p.ExitCode;
            }
            if (codigo != 0 || !File.Exists(Path.Combine(destino, @"app\index.html")))
                throw new Exception((erros + "\n" + saida).Trim());

            if (!semRegistro) Registrar(destino);

            if (!semAbrir)
            {
                Process.Start(new ProcessStartInfo(Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe"),
                    "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"" + Path.Combine(destino, "iniciar.ps1") + "\"")
                    { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = destino });
            }
            if (!silencioso)
                MessageBox.Show("Pronto! O Planejar Rotas foi instalado.\n\n" +
                    "Para abrir depois, use o atalho \"Planejar Rotas\".\n" +
                    "Para remover: Configurações > Aplicativos > Aplicativos instalados.",
                    Titulo, MessageBoxButtons.OK, MessageBoxIcon.Information);
            return 0;
        }
        catch (Exception e)
        {
            if (!silencioso)
                MessageBox.Show("Não foi possível instalar.\n\n" + e.Message, Titulo, MessageBoxButtons.OK, MessageBoxIcon.Error);
            else
                Console.Error.WriteLine(e.Message);
            return 2;
        }
        finally
        {
            try { Directory.Delete(temp, true); } catch { }
        }
    }

    // Item em "Aplicativos instalados" (só do usuário atual, sem administrador).
    static void Registrar(string destino)
    {
        using (RegistryKey k = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\PlanejarRotas"))
        {
            string ps = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");
            k.SetValue("DisplayName", "Planejar Rotas com Checklist");
            k.SetValue("DisplayVersion", "13.0.0");
            k.SetValue("Publisher", "Grupo DK2");
            k.SetValue("InstallLocation", destino);
            k.SetValue("DisplayIcon", Path.Combine(destino, "planejar-rotas.ico"));
            k.SetValue("UninstallString", "\"" + ps + "\" -NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(destino, "desinstalar.ps1") + "\"");
            k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
            k.SetValue("NoModify", 1, RegistryValueKind.DWord);
            k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }
}
