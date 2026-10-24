// The launcher of Tent.js on Windows. Built twice by the release script: as tent.exe for a terminal, and as
// tentw.exe, which shows no window of a terminal, for the task that `tent service` writes. It starts the runtime
// of the version that `current` names with the player and the words it was handed, and starts it again when it
// ends with 75, after an update it took by itself. It is written for the compiler that every Windows carries.
using System;
using System.Diagnostics;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

static class Launcher
{
    static void Say(string text)
    {
#if CONSOLE
        Console.Error.WriteLine(text);
#else
        // A program with no terminal has nobody to tell: what it would say goes to a file of the install.
        try { File.AppendAllText(Path.Combine(Home(), "launcher.log"), DateTime.UtcNow.ToString("o") + " " + text + "\r\n"); }
        catch (Exception) { }
#endif
    }

    // The folder of the install is the one above the folder of this program, `bin/`.
    static string Home()
    {
        string bin = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName);
        return Path.GetDirectoryName(bin);
    }

    static string Line(string file)
    {
        try { return File.ReadAllText(file).Trim(); }
        catch (Exception) { return ""; }
    }

    // Nothing runs from a folder that is not the person's own, or that others can write into.
    static string Held(string folder)
    {
        DirectoryInfo info = new DirectoryInfo(folder);
        if ((info.Attributes & FileAttributes.ReparsePoint) != 0) return folder + " is a link";
        DirectorySecurity security = info.GetAccessControl(AccessControlSections.Owner | AccessControlSections.Access);
        SecurityIdentifier me = WindowsIdentity.GetCurrent().User;
        IdentityReference owner = security.GetOwner(typeof(SecurityIdentifier));
        SecurityIdentifier admins = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        SecurityIdentifier system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        SecurityIdentifier creator = new SecurityIdentifier(WellKnownSidType.CreatorOwnerSid, null);
        if (owner == null || !(owner.Equals(me) || owner.Equals(admins) || owner.Equals(system))) return folder + " is not your own";
        FileSystemRights writes = FileSystemRights.WriteData | FileSystemRights.AppendData | FileSystemRights.CreateDirectories
            | FileSystemRights.Delete | FileSystemRights.DeleteSubdirectoriesAndFiles | FileSystemRights.ChangePermissions
            | FileSystemRights.TakeOwnership;
        foreach (FileSystemAccessRule rule in security.GetAccessRules(true, true, typeof(SecurityIdentifier)))
        {
            if (rule.AccessControlType != AccessControlType.Allow || (rule.FileSystemRights & writes) == 0) continue;
            IdentityReference who = rule.IdentityReference;
            if (who.Equals(me) || who.Equals(admins) || who.Equals(system) || who.Equals(creator)) continue;
            return "others can write into " + folder;
        }
        return null;
    }

    // One word of a command line, written so that the program it starts reads it back as that one word.
    static string Quoted(string word)
    {
        if (word.Length > 0 && word.IndexOfAny(new char[] { ' ', '\t', '"', '\n', '\v' }) < 0) return word;
        StringBuilder made = new StringBuilder("\"");
        int slashes = 0;
        foreach (char one in word)
        {
            if (one == '\\') { slashes++; continue; }
            if (one == '"') made.Append('\\', slashes * 2 + 1);
            else made.Append('\\', slashes);
            slashes = 0;
            made.Append(one);
        }
        made.Append('\\', slashes * 2);
        made.Append('"');
        return made.ToString();
    }

    static int Main(string[] words)
    {
        string home = Home();
        for (;;)
        {
            string version = Line(Path.Combine(home, "current"));
            string folder = Path.Combine(Path.Combine(home, "versions"), version);
            if (version == "" || !Directory.Exists(folder))
            {
                string was = version;
                version = Line(Path.Combine(home, "previous"));
                folder = Path.Combine(Path.Combine(home, "versions"), version);
                if (version == "" || !Directory.Exists(folder))
                {
                    Say("Tent.js is not installed whole in " + home + ": install it again.");
                    return 2;
                }
                Say("Tent.js: the version " + was + " that current names is not there, so " + version + " is used.");
            }
            foreach (string one in new string[] { home, Path.Combine(home, "versions"), folder, Path.Combine(folder, "runtime"), Path.Combine(folder, "player") })
            {
                string why = Held(one);
                if (why != null)
                {
                    Say("Tent.js runs nothing from " + one + ": " + why + ".");
                    return 2;
                }
            }
            StringBuilder line = new StringBuilder(Quoted(Path.Combine(Path.Combine(folder, "player"), "tent.mjs")));
            foreach (string word in words) line.Append(' ').Append(Quoted(word));
            ProcessStartInfo start = new ProcessStartInfo(Path.Combine(Path.Combine(folder, "runtime"), "node.exe"), line.ToString());
            start.UseShellExecute = false;
#if !CONSOLE
            // No window, and no hidden terminal either: the player must not take a terminal that nobody sees for a
            // person who sits at it, so its streams are pipes, which nothing types into.
            start.CreateNoWindow = true;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
#endif
            Process child = Process.Start(start);
#if !CONSOLE
            child.StandardInput.Close();
            child.OutputDataReceived += (sender, e) => { };
            child.ErrorDataReceived += (sender, e) => { };
            child.BeginOutputReadLine();
            child.BeginErrorReadLine();
#endif
            child.WaitForExit();
            int code = child.ExitCode;
            if (code != 75) return code;
        }
    }
}
